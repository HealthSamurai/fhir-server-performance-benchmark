#!/usr/bin/env python3
"""Load the US Core profiles the Synthea dataset declares into a FHIR server.

705 of the ~1150 entries in every import bundle carry meta.profile pointing at
US Core. Servers differ in what they do when that canonical cannot be resolved:
aidbox accepts the resource and validates against the base spec only, MS FHIR
treats it as an error and rejects the whole transaction. Loading the profiles
first is what makes validation-on-write comparable between them.

The dataset mixes IG versions -- us-core-bmi and the vital-signs profiles exist
only from 5.0.1, while plain us-core-condition was split into two narrower
profiles in 6.0.0 and is only available up to 4.0.0 -- so both packages are
loaded.

Standard library only, so it runs in a bare python image:

    docker run --rm --network perf_default -v "$PWD/scripts:/scripts" \\
        python:3.12-alpine python /scripts/load-us-core.py http://microsoft:8080
"""

import io
import json
import sys
import tarfile
import urllib.error
import urllib.request

PACKAGES = ["5.0.1", "4.0.0"]
LOADED_TYPES = ["CodeSystem", "ValueSet", "StructureDefinition"]


def download(version):
    url = f"https://packages.fhir.org/hl7.fhir.us.core/{version}"
    print(f"downloading hl7.fhir.us.core#{version}")
    with urllib.request.urlopen(url, timeout=300) as resp:
        return resp.read()


def definitions(blob):
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz") as tar:
        for member in tar.getmembers():
            if not member.name.endswith(".json"):
                continue
            handle = tar.extractfile(member)
            if handle is None:
                continue
            try:
                resource = json.load(handle)
            except Exception:
                continue
            if resource.get("resourceType") in LOADED_TYPES and resource.get("id"):
                yield resource


def put(base, resource):
    request = urllib.request.Request(
        f"{base}/{resource['resourceType']}/{resource['id']}",
        data=json.dumps(resource).encode(),
        headers={"Content-Type": "application/fhir+json"},
        method="PUT")
    urllib.request.urlopen(request, timeout=300).read()


def main():
    if len(sys.argv) != 2:
        sys.exit(f"usage: {sys.argv[0]} <fhir-base-url>")
    base = sys.argv[1].rstrip("/")

    resources = {}
    for version in PACKAGES:
        for resource in definitions(download(version)):
            # MS FHIR runs the narrative through a strict XHTML parser and
            # rejects about half the IG's definitions over markup it will not
            # accept. The narrative is documentation; nothing validates on it.
            resource.pop("text", None)
            # First package wins, so 4.0.0 only fills in what 5.0.1 dropped.
            resources.setdefault((resource["resourceType"], resource["id"]), resource)

    # Terminology before profiles: a StructureDefinition binding to a value set
    # the server does not have validates weaker than it should.
    failures = []
    loaded = 0
    for resource_type in LOADED_TYPES:
        for (kind, _), resource in resources.items():
            if kind != resource_type:
                continue
            try:
                put(base, resource)
                loaded += 1
            except urllib.error.HTTPError as err:
                body = err.read()[:200].decode(errors="replace")
                failures.append(f"{kind}/{resource['id']}: HTTP {err.code} {body}")
            except Exception as err:  # noqa: BLE001 - report, do not mask
                failures.append(f"{kind}/{resource['id']}: {err}")
        print(f"{resource_type}: {loaded} loaded, {len(failures)} failed")

    for failure in failures[:10]:
        print(f"  ! {failure}")
    if failures:
        sys.exit(f"{len(failures)} definition(s) failed to load")
    print(f"done: {loaded} definitions loaded into {base}")


if __name__ == "__main__":
    main()
