#!/usr/bin/env bash

cd "$(dirname "$0")/.."

python core_python/speed_test.py >> logs.txt
