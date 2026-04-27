#!/bin/sh

set -e

# CLI utility for running FHIR server performance tests
# Usage: ./runner.sh [-t test] [-s server] [-id runId]
#   -t test: path to test file (e.g., /test/crud.js, /test/search.js)
#   -s server: target server: aidbox, hapi, medplum, octofhir (optional - runs on all servers if not specified)
#   -id runId: custom run ID (optional - defaults to current UTC timestamp)

# Default values
DEFAULT_TEST="/k6/prewarm.js"
ALL_SERVERS="aidbox hapi medplum octofhir"

# Function to display usage
show_usage() {
    echo "Usage: $0 [-t test] [-s server] [-id runId] [-f file1 -f file2 ...]"
    echo "       $0 bootstrap [-f file1 -f file2 ...]"
    echo ""
    echo "Commands:"
    echo "  bootstrap  Start Docker Compose services"
    echo ""
    echo "Arguments:"
    echo "  -t test    Path to test file (e.g., /k6/crud.js, /k6/search.js)"
    echo "  -s server  Target server: aidbox, hapi, medplum, octofhir"
    echo "  -id runId  Custom run ID (optional - defaults to current UTC timestamp)"
    echo "  -f file    Docker Compose file(s) to use (can be specified multiple times)"
    echo "             If not specified, uses the default docker-compose.yaml"
    echo ""
    echo "Examples:"
    echo "  $0 bootstrap                                    # Start services"
    echo "  $0 bootstrap -f docker-compose.yaml -f docker-compose.prod.yaml  # Start with multiple compose files"
    echo "  $0 -t /k6/crud.js -s aidbox -id my-test-run     # Run CRUD test on Aidbox with custom ID"
    echo "  $0 -t /k6/search.js -s hapi                     # Run search test on HAPI with auto-generated ID"
    echo "  $0 -t /k6/prewarm.js                            # Run prewarm test on all servers"
    echo "  $0 -t /k6/crud.js -f docker-compose.yaml -f override.yaml  # Run test with custom compose files"
    echo "  $0                                                # Run default test on all servers"
    echo ""
    echo "Available tests:"
    echo "  /k6/prewarm.js"
    echo "  /k6/crud.js"
    echo "  /k6/search.js"
    echo "  /k6/import.js"
    echo "  /k6/import-seed.js"
    echo "  /k6/auth.js"
}

# Function to bootstrap Docker Compose services with retry logic
bootstrap_services() {
    local max_attempts=5
    local attempt=1

    echo "Pulling docker images..."
    echo "================================================"
    docker compose $COMPOSE_FILES pull aidbox hapi medplum

    echo "Starting Docker Compose services  (max $max_attempts attempts)..."
    echo "================================================"

    while [ $attempt -le $max_attempts ]; do
        echo "Attempt $attempt/$max_attempts: Starting services..."

        if docker compose $COMPOSE_FILES up -d --wait; then
            echo "✅ Services started successfully on attempt $attempt!"
            echo "================================================"
            return 0
        else
            echo "❌ Attempt $attempt failed. Services may still be starting up..."

            if [ $attempt -lt $max_attempts ]; then
                echo "Waiting 10 seconds before retry..."
                sleep 10
            fi

            attempt=$((attempt + 1))
        fi
    done

    echo "❌ Failed to start services after $max_attempts attempts"
    echo "================================================"
    return 1
}

# Function to validate server argument
validate_server() {
    local server=$1
    case " $ALL_SERVERS " in
        *" $server "*) return 0 ;;
        *) return 1 ;;
    esac
}

# Function to run test on a specific server
run_test_on_server() {
    local test_path=$1
    local server=$2
    local run_id=$3

    local run_env="
        export BUNDLE_URL=http://tgz:8080
        export K6_PROMETHEUS_RW_SERVER_URL=http://prometheus:9090/api/v1/write
        export K6_PROMETHEUS_RW_TREND_STATS='p(95),p(99),min,max'"

    local k6_args="\
        --no-usage-report -o experimental-prometheus-rw \
        --tag runid=${run_id} --tag fhirimpl=${server}  "

    echo "Running test: $test_path on server: $server with run ID: $run_id"
    echo "================================================"

    case $server in
        "aidbox")
            run_env="${run_env}
                export BASE_URL=http://aidbox:8080/fhir"
            ;;
        "hapi")
            run_env="${run_env}
                export BASE_URL=http://hapi:8080/fhir"
            ;;
        "medplum")
            run_env="${run_env}
                export BASE_URL=http://medplum:8103/fhir/R4
                export OAUTH2_USER=admin@example.com
                export OAUTH2_PASSWORD=medplum_admin
                export OAUTH2_LOGIN_URL=http://medplum:8103/auth/login
                export OAUTH2_TOKEN_URL=http://medplum:8103/oauth2/token"
            ;;
        "octofhir")
            run_env="${run_env}
                export BASE_URL=http://octofhir:8888/fhir"
            ;;
    esac

    # TODO: quiet  for docker compose and k6

    if [ -n "$CI" ]; then
        docker compose $COMPOSE_FILES run -q --rm --entrypoint /bin/sh k6 -c "$run_env && k6 run --quiet $k6_args $test_path"
    else
        docker compose $COMPOSE_FILES run -q --rm --entrypoint /bin/sh k6 -c "$run_env && k6 run $k6_args $test_path"
    fi

    echo ""
    echo "Completed test: $test_path on server: $server"
    echo "----------------------------------------"
    echo ""
    echo ""
}

# Parse command line arguments
TEST_PATH=""
SERVER=""
RUN_ID=""
COMPOSE_FILES=""

# Check for help flag
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# Check for bootstrap command and collect compose files
if [ "$1" = "bootstrap" ]; then
    shift
    # Parse remaining arguments for -f flags
    while [ $# -gt 0 ]; do
        case $1 in
            -f)
                if [ -z "$COMPOSE_FILES" ]; then
                    COMPOSE_FILES="-f $2"
                else
                    COMPOSE_FILES="$COMPOSE_FILES -f $2"
                fi
                shift 2
                ;;
            *)
                echo "Unknown option for bootstrap: $1" >&2
                show_usage
                exit 1
                ;;
        esac
    done
    bootstrap_services
    exit 0
fi

# Parse arguments manually to handle -id flag properly
while [ $# -gt 0 ]; do
    case $1 in
        -t)
            TEST_PATH="$2"
            shift 2
            ;;
        -s)
            SERVER="$2"
            shift 2
            ;;
        -id)
            RUN_ID="$2"
            shift 2
            ;;
        -f)
            if [ -z "$COMPOSE_FILES" ]; then
                COMPOSE_FILES="-f $2"
            else
                COMPOSE_FILES="$COMPOSE_FILES -f $2"
            fi
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            show_usage
            exit 1
            ;;
    esac
done

# Set default test if not specified
if [ -z "$TEST_PATH" ]; then
    TEST_PATH=$DEFAULT_TEST
fi

# Set default run ID if not specified
if [ -z "$RUN_ID" ]; then
    # Check if RUNID environment variable is set
    if [ -n "$RUNID" ]; then
        RUN_ID="$RUNID"
    else
        RUN_ID=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    fi
fi

# Validate test path
if [ ! -f "k6/$(basename "$TEST_PATH")" ]; then
    echo "Error: Test file not found: $TEST_PATH"
    echo "Available tests:"
    ls -1 k6/*.js | sed 's|k6/|  /k6/|'
    exit 1
fi

# Validate server if specified
if [ -n "$SERVER" ] && ! validate_server "$SERVER"; then
    echo "Error: Invalid server '$SERVER'"
    echo "Valid servers: $ALL_SERVERS"
    exit 1
fi

# Run the test(s)
if [ -z "$SERVER" ]; then
    # Run on all servers
    echo "Running test '$TEST_PATH' on all servers sequentially with run ID: $RUN_ID"
    echo ""
    for server in $ALL_SERVERS; do
        run_test_on_server "$TEST_PATH" "$server" "$RUN_ID"
    done
    echo "All tests completed!"
else
    # Run on specific server
    run_test_on_server "$TEST_PATH" "$SERVER" "$RUN_ID"
fi
