#!/bin/bash
set -u
profiles_path="$1"
boundaries_path="$2"
output_dir="$3"
mkdir -p "$output_dir"
mapfile_cmd=''
count=0
success=0
failed=0
consecutive_failed=0
while IFS=$'\t' read -r key osm_type osm_id status; do
  [ "$status" = "complete" ] && continue
  count=$((count + 1))
  safe=$(printf '%s' "$key" | tr '/' '_')
  output="$output_dir/$safe.json"
  [ -s "$output" ] && { success=$((success + 1)); continue; }
  [ "$osm_type" != "relation" ] && { printf 'BUILDING_OPEN_SKIPPED %s\n' "$key"; failed=$((failed + 1)); continue; }
  area=$((osm_id + 3600000000))
  query="[out:json][timeout:90];area($area)->.a;nwr(area.a)[\"building\"~\"^(apartments|house|residential|commercial|retail|industrial)$\"];out center tags;"
  tmp="$output.tmp"
  if curl -fsS --max-time 120 -X POST 'https://overpass-api.de/api/interpreter' --data-urlencode "data=$query" -o "$tmp" && jq -e '.elements' "$tmp" >/dev/null 2>&1; then
    jq --arg key "$key" '{key:$key,elements:.elements}' "$tmp" > "$output"
    success=$((success + 1))
    consecutive_failed=0
  else
    rm -f "$tmp"
    if curl -fsS --max-time 120 -X POST 'https://overpass.kumi.systems/api/interpreter' --data-urlencode "data=$query" -o "$tmp" && jq -e '.elements' "$tmp" >/dev/null 2>&1; then
      jq --arg key "$key" '{key:$key,elements:.elements}' "$tmp" > "$output"
      success=$((success + 1))
      consecutive_failed=0
    else
      rm -f "$tmp"
      printf 'BUILDING_OPEN_FAILED %s\n' "$key"
      failed=$((failed + 1))
      consecutive_failed=$((consecutive_failed + 1))
    fi
  fi
  if [ "$consecutive_failed" -ge 5 ]; then
    printf 'BUILDING_OPEN_RATE_LIMIT_STOP consecutive_failed=%s\n' "$consecutive_failed"
    break
  fi
  if [ $((count % 10)) -eq 0 ]; then printf 'BUILDING_OPEN_PROGRESS %s success=%s failed=%s\n' "$count" "$success" "$failed"; fi
  sleep 1
  done < <(jq -r --slurpfile b "$boundaries_path" '.profiles[] | . as $p | ($b[0].features[] | select(.properties.key == $p.key) | [.properties.key,.properties.osm_type,(.properties.osm_id|tostring),($p.stable_profile.status // "")]) | @tsv' "$profiles_path")
printf 'BUILDING_OPEN_DONE attempted=%s success=%s failed=%s\n' "$count" "$success" "$failed"
