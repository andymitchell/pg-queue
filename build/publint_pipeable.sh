#!/bin/bash

# Run publint and capture its output
output=$(npx publint 2>&1)

# Check if "All good" is in the output
echo "$output" | grep "All good" > /dev/null

if [ $? -eq 0 ]; then
    echo "$output"
else
    echo "$output"
    echo "(Want colour coding? Run 'npx publint' directly in the terminal)"
  exit 1
fi