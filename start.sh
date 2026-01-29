#!/bin/bash
trap 'kill 0' EXIT

cd "$(dirname "$0")"

python3 -m uvicorn server:app --reload &
cd frontend && npm run dev &

wait
