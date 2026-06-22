export default
{
  "string": {
    "Patient": {
      "name": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "Emilia", "Carolynn", "Stefan", "Linh", "Harold",
          "Pilar", "Ron", "Garfield", "Margaretta", "Giovanna",
          "Dione", "Arron", "Lanny", "Harvey", "Beatriz",
          "Donovan", "Reyes", "Santiago", "Kyong", "Curtis"
        ]
      },
      "address": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "Raynham", "Springfield", "Lowell", "Southwick", "Mashpee",
          "Holbrook", "Falmouth", "Revere", "Sturbridge", "Blackstone",
          "Westport", "Walpole", "Northampton", "Fall River", "Waltham",
          "Acushnet Center", "Newton", "Winchester", "Maynard"
        ]
      }
    },
    "Organization": {
      "name": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "ORLEANS MEDICAL CENTER, P.C.",
          "ENCOMPASS HEALTH BRAINTREE HOSPITAL OF BRAINTREE",
          "STEWARD HOLY FAMILY HOSPITAL INC",
          "THE NORTHEAST HEALTH GROUP, INC",
          "PLYMOUTH BAY INTERNAL MEDICINE",
          "ART OF CARE INC",
          "T MASSACHUSETTS, LLC",
          "RIVERBEND OF SOUTH NATICK",
          "NEW ENGLAND PROFESSIONAL HOME HEALTH CARE LLC",
          "HDH CORPORATION",
          "ELARA CARING",
          "OVERLOOK MASONIC HEALTH CENTER",
          "ENCOMPASS HEALTH REHAB HOSPITAL OF WESTERN MASS",
          "PLYMOUTH CARVER PRIMARY CARE, P.C.",
          "BOSTON HEALTH CARE FOR THE HOMELESS PROGRAM INC",
          "TUFTS MEDICAL CENTER",
          "GREATER LOWELL FAMILY PRACTICE PC",
          "NORTH READING INTERNAL MEDICINE PC"
        ]
      }
    }
  },

  "date": {
    "Patient": {
      "birthdate": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01", 
          "1991-05-12", "2003-09-14", "1916-12-23", "1964-04-23", "1913-12-30",
          "1978-05-25", "2011-01-12", "1932-09-05", "2007-09-10", "1968-12-27",
          "2004-07-19", "2018-01-08", "2022-05-05", "2000-01-18", "2013-10-07",
          "1980-06-12", "2019-10-23", "1954-03-21", "1961-09-27", "1942-07-18",
        ]
      }
    },
    "Observation": {
      "date": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01T00:00:00", 
          "2017-01-29T05:36:48", "2024-05-30T06:16:35", "2016-08-21T14:53:50", "2021-01-26T16:56:53", "2022-07-28T10:41:20",
          "2021-07-29T06:16:35", "2017-10-30T18:53:59", "2015-09-05T00:05:56", "2017-07-09T06:36:13", "2014-12-07T14:53:50",
          "2015-04-23T06:57:55", "2023-07-06T04:32:31", "2016-09-18T14:53:50", "2021-12-30T18:23:17", "2019-03-17T05:36:48",
          "2015-09-23T09:33:23", "2018-06-02T19:17:08", "2023-09-11T03:55:48", "2024-06-07T02:18:51", "2018-04-12T07:33:57"
        ]
      }
    },
    "Encounter": {
      "date": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01", 
          "1988-11-29", "2017-12-16", "2019-08-14", "1999-06-26", "1962-05-07",
          "1986-09-06", "2015-07-09", "2015-09-05", "2016-12-29", "1958-08-07",
          "1990-10-02", "2017-11-28", "2024-01-22", "2019-01-05", "2019-08-04",
          "1998-12-05", "1990-07-20", "2021-02-16", "2022-06-24", "2017-02-22"
        ]
      }
    }
  },


  "token": {
    "Observation": {
      "category": {
        "values": [
          "missing-data|for-null-searches",
          "laboratory",
          "http://terminology.hl7.org/CodeSystem/observation-category|laboratory",
          "vital-signs",
          "survey",
          "social-history",
          "procedure",
          "laboratory,vital-signs",
          "laboratory,vital-signs,survey"
        ]
      },
      "code": {
        "values": [
          "non-existent-loinc-9999999",
          "8302-2",
          "29463-7",
          "8480-6",
          "8462-4",
          "8867-4",
          "39156-5",
          "72514-3",
          "718-7",
          "http://loinc.org|8302-2",
          "http://loinc.org|29463-7",
          "8302-2,29463-7",
          "8480-6,8462-4,8867-4"
        ]
      }
    },
    "Encounter": {
      "status": {
        "values": [
          "missing-status",
          "finished",
          "in-progress",
          "planned",
          "arrived",
          "cancelled",
          "finished,in-progress",
          "finished,in-progress,planned"
        ]
      },
      "class": {
        "values": [
          "missing|class-code",
          "AMB",
          "EMER",
          "IMP",
          "HH",
          "OBSENC",
          "WELLNESS",
          "http://terminology.hl7.org/CodeSystem/v3-ActCode|AMB",
          "http://terminology.hl7.org/CodeSystem/v3-ActCode|EMER",
          "AMB,EMER",
          "AMB,EMER,IMP"
        ]
      }
    },
  },

  "quantity": {
    "Observation": {
      "value-quantity": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le"],
        "values": [
          "99999",
          "170",
          "80",
          "30",
          "100",
          "140",
          "200"
        ]
      },
      "component-value-quantity": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le"],
        "values": [
          "99999",
          "120",
          "80",
          "140",
          "90",
          "100",
          "60"
        ]
      },
      "combo-value-quantity": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le"],
        "values": [
          "99999",
          "120",
          "170",
          "80",
          "100",
          "140"
        ]
      }
    }
  },

  "composite": {
    "Observation": {
      "code-value-quantity": {
        "values": [
          "non-existent-code$gt0",
          "8867-4$gt100",
          "8867-4$lt60",
          "8302-2$gt170",
          "29463-7$gt80",
          "29463-7$lt5",
          "39156-5$ge30",
          "2339-0$gt140",
          "2947-0$gt142",
          "http://loinc.org|8867-4$gt100",
          "http://loinc.org|8302-2$gt170",
          "http://loinc.org|39156-5$ge30"
        ]
      },
      "component-code-value-quantity": {
        "values": [
          "non-existent$gt0",
          "8480-6$gt140",
          "8480-6$ge180",
          "8480-6$lt100",
          "8462-4$gt90",
          "8462-4$lt60",
          "http://loinc.org|8480-6$gt140",
          "http://loinc.org|8462-4$gt90"
        ]
      },
      "combo-code-value-quantity": {
        "values": [
          "non-existent$gt0",
          "8867-4$gt100",
          "8480-6$gt140",
          "8302-2$gt170",
          "29463-7$gt80",
          "39156-5$ge30",
          "http://loinc.org|8480-6$gt140"
        ]
      }
    }
  },

  "reference": {
    "Observation": {
      "subject":   { "valueRef": "Patient" },
      "encounter": { "valueRef": "Encounter" },
      "performer": { "valueRef": "Practitioner" }
    },
    "Encounter": {
      "subject":     { "valueRef": "Patient" },
      "participant": { "valueRef": "Practitioner" }
    },
    "MedicationRequest": {
      "subject":   { "valueRef": "Patient" },
      "encounter": { "valueRef": "Encounter" },
      "requester": { "valueRef": "Practitioner" }
    }
  }
}
