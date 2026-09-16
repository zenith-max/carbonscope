#!/usr/bin/env bash
set -e

python -m pip install --upgrade pip
pip install -r requirements.txt

mkdir -p backend/data
if [ ! -f backend/data/owid-co2-data.csv ]; then
  echo "Downloading OWID CO2 dataset for deployment..."
  curl -L --fail \
    "https://raw.githubusercontent.com/owid/co2-data/master/owid-co2-data.csv" \
    -o backend/data/owid-co2-data.csv
fi

if [ ! -f backend/data/processed_dataset.json ]; then
  echo "Generating processed dataset..."
  python backend/build_dataset.py
fi

npm install --prefix frontend
npm run build --prefix frontend
