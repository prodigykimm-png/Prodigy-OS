import os
import sys
import json
import hashlib
import re

# Paths
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
TEMPLATE_PATH = os.path.join(BASE_DIR, "SYSTEM/TEMPLATE/FORMAT/template_auction_case.md")
CACHE_DIR = os.path.join(BASE_DIR, "SYSTEM/CACHE")
HASH_DIR = os.path.join(CACHE_DIR, "hashes")
JSON_DIR = os.path.join(CACHE_DIR, "json")
RUNTIME_DIR = os.path.join(CACHE_DIR, "runtime")

HASH_FILE = os.path.join(HASH_DIR, "auction_template.hash")
SCHEMA_FILE = os.path.join(JSON_DIR, "auction_template_schema.json")
BASELINE_FILE = os.path.join(RUNTIME_DIR, "auction_baseline.json")

VALIDATOR_SCHEMA_VERSION = "1.2.0"

# 1. Expanded Forbidden Properties
FORBIDDEN_PROPERTIES = [
    "due_date",
    "review_status",
    "auction_date",
    "bid_result",
    "monthly_rent",
    "rent_deposit",
    "priority",
    "market_sale_low",
    "risk_flags",
    "minimum_bid_rate",
    "next_action",
    "market_sale_high",
    "market_jeonse_recent",
    "market_monthly_recent",
    "actual_bid",
    "winning_bid"
]

# 2. User-Owned Sections
USER_OWNED_SECTIONS = [
    "## Quick Note",
    "# Investment Thesis",
    "# Site Visit Report",
    "# Investment Decision",
    "# Review"
]

def ensure_directories():
    os.makedirs(HASH_DIR, exist_ok=True)
    os.makedirs(JSON_DIR, exist_ok=True)
    os.makedirs(RUNTIME_DIR, exist_ok=True)

def calculate_hash(content):
    return hashlib.sha256(content.encode('utf-8')).hexdigest()

def split_markdown(content):
    content = content.replace('\r\n', '\n')
    if content.startswith('---\n'):
        parts = content.split('\n---\n', 1)
        if len(parts) == 2:
            return parts[0][4:], parts[1]
    return "", content

def parse_yaml(lines):
    data = {}
    current_section = None
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith('#'):
            continue
        
        indent = len(line) - len(line.lstrip())
        
        if ':' in line:
            parts = line.split(':', 1)
            key = parts[0].strip()
            val = parts[1].strip()
            
            if '#' in val:
                val = val.split('#')[0].strip()
                
            if indent == 0:
                if val == "" and key in ["source", "attachments"]:
                    current_section = key
                    data[current_section] = {}
                else:
                    data[key] = val
                    current_section = None
            else:
                if current_section:
                    data[current_section][key] = val
    return data

def extract_headings(body):
    headings = []
    for line in body.splitlines():
        if line.startswith('#'):
            headings.append(line.strip())
    return headings

def extract_section_content(body_text, section_name):
    escaped_name = re.escape(section_name)
    pattern = rf"{escaped_name}\s*\n([\s\S]*?)(?=\n#|\n---|$)"
    match = re.search(pattern, body_text)
    if match:
        return match.group(1).strip()
    return ""

def to_number(val):
    if val is None or val == "":
        return None
    val_str = str(val).strip()
    val_str = re.sub(r'[^\d.]', '', val_str)
    if not val_str:
        return None
    try:
        if '.' in val_str:
            return float(val_str)
        return int(val_str)
    except ValueError:
        return None

def get_template_schema():
    with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        content = f.read()
    
    current_hash = calculate_hash(content)
    
    if os.path.exists(HASH_FILE) and os.path.exists(SCHEMA_FILE):
        with open(HASH_FILE, 'r', encoding='utf-8') as f:
            cached_hash = f.read().strip()
        if cached_hash == current_hash:
            try:
                with open(SCHEMA_FILE, 'r', encoding='utf-8') as f:
                    schema = json.load(f)
                if schema.get("validator_schema_version") == VALIDATOR_SCHEMA_VERSION:
                    return schema, True
            except Exception:
                pass
                
    yaml_text, body_text = split_markdown(content)
    yaml_lines = yaml_text.split('\n')
    
    yaml_data = parse_yaml(yaml_lines)
    
    top_level_keys = list(yaml_data.keys())
    nested_structure = {}
    for k, v in yaml_data.items():
        if isinstance(v, dict):
            nested_structure[k] = list(v.keys())
            
    raw_headings = extract_headings(body_text)
    required_headings = []
    for h in raw_headings:
        if not h.startswith('# <%') and not h.startswith('# <%-') and not h.startswith('# -'):
            required_headings.append(h)
            
    schema = {
        "validator_schema_version": VALIDATOR_SCHEMA_VERSION,
        "template_hash": current_hash,
        "top_level_keys": top_level_keys,
        "nested_structure": nested_structure,
        "required_headings": required_headings,
        "forbidden_properties": FORBIDDEN_PROPERTIES
    }
    
    with open(HASH_FILE, 'w', encoding='utf-8') as f:
        f.write(current_hash)
    with open(SCHEMA_FILE, 'w', encoding='utf-8') as f:
        json.dump(schema, f, indent=2, ensure_ascii=False)
        
    return schema, False

def validate_file(file_path, rel_path, schema, baseline_data):
    issues = []
    warnings = []
    modified_sections = []
    
    checked = {
        "yaml_properties": False,
        "expected_bid_vs_minimum": False,
        "source_urls": False,
        "market_evidence": False,
        "headings": False,
        "baseline_comparison": False
    }
    
    if not os.path.exists(file_path):
        return {
            "validation": "failed",
            "issues": [f"File not found: {file_path}"],
            "warnings": [],
            "checked": checked,
            "modified_sections": []
        }
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        return {
            "validation": "failed",
            "issues": [f"Failed to read file: {e}"],
            "warnings": [],
            "checked": checked,
            "modified_sections": []
        }
        
    yaml_text, body_text = split_markdown(content)
    if not yaml_text and content.startswith('---\n'):
        return {
            "validation": "failed",
            "issues": ["Invalid markdown: missing frontmatter dividers '---'"],
            "warnings": [],
            "checked": checked,
            "modified_sections": []
        }
        
    yaml_lines = yaml_text.split('\n')
    file_yaml = parse_yaml(yaml_lines)
    
    # 1. YAML Property Compliance
    checked["yaml_properties"] = True
    for k in file_yaml.keys():
        if k in schema["top_level_keys"]:
            pass
        elif k in schema["forbidden_properties"]:
            issues.append(f"Forbidden legacy YAML property found: '{k}'")
        else:
            issues.append(f"YAML property '{k}' is absent from the template")
            
        if k in schema["nested_structure"]:
            file_nested = file_yaml[k]
            if not isinstance(file_nested, dict):
                issues.append(f"Nested YAML property '{k}' must be a dictionary")
            else:
                for subk in file_nested.keys():
                    if subk in schema["nested_structure"][k]:
                        pass
                    elif subk in schema["forbidden_properties"] or f"{k}.{subk}" in schema["forbidden_properties"]:
                        issues.append(f"Forbidden legacy YAML property found: '{k}.{subk}'")
                    else:
                        issues.append(f"Unexpected nested key '{k}.{subk}'")
                        
    for k in schema["top_level_keys"]:
        if k not in file_yaml:
            issues.append(f"Missing YAML property: '{k}'")
        elif k in schema["nested_structure"]:
            file_nested = file_yaml[k]
            if isinstance(file_nested, dict):
                for subk in schema["nested_structure"][k]:
                    if subk not in file_nested:
                        issues.append(f"Missing nested YAML property: '{k}.{subk}'")
                        
    # 2. expected_bid >= minimum_bid check
    exp_bid = to_number(file_yaml.get("expected_bid"))
    min_bid = to_number(file_yaml.get("minimum_bid"))
    if exp_bid is not None and min_bid is not None:
        checked["expected_bid_vs_minimum"] = True
        if exp_bid < min_bid:
            issues.append(f"Validation failure: expected_bid ({exp_bid}) is less than minimum_bid ({min_bid})")
            
    # 3. Source properties checks (empty = Issue, "정보 없음" = Warning)
    source = file_yaml.get("source", {})
    if not isinstance(source, dict):
        issues.append("YAML property 'source' must be a dictionary")
    else:
        checked["source_urls"] = True
        for key_name, complexes_check, product_id_check in [
            ("naver", "new.land.naver.com/complexes", None),
            ("auction", "auction1.co.kr", "product_id"),
            ("cafe", "cafe.naver.com", None)
        ]:
            val = source.get(key_name)
            if val is None or str(val).strip() == "":
                issues.append(f"Missing source property: 'source.{key_name}' must not be blank")
            else:
                val_str = str(val).strip()
                if val_str in ["정보 없음", "메모 없음"]:
                    warnings.append(f"source.{key_name} is placeholder ('{val_str}')")
                else:
                    if not (val_str.startswith("http://") or val_str.startswith("https://")):
                        issues.append(f"source.{key_name} must be a valid HTTP/HTTPS URL")
                    else:
                        if complexes_check and complexes_check not in val_str:
                            issues.append(f"source.{key_name} URL must contain '{complexes_check}'")
                        if product_id_check and product_id_check not in val_str:
                            issues.append(f"source.{key_name} URL must contain '{product_id_check}'")
                            
    # 4. Refined Market Evidence check
    checked["market_evidence"] = True
    
    # 4a. Check market_price_basis (Must be meaningful)
    basis_val = file_yaml.get("market_price_basis")
    if basis_val is None or str(basis_val).strip() == "":
        issues.append("Missing market evidence: 'market_price_basis' must not be blank")
    else:
        basis_str = str(basis_val).strip()
        if basis_str in ["정보 없음", "메모 없음", "시세 근거"]:
            issues.append(f"Missing market evidence: 'market_price_basis' must be meaningful (cannot be placeholder '{basis_str}')")
            
    # 4b. Check other 5 price properties
    for f in ["market_sale_price", "market_jeonse_price", "expected_deposit", "expected_monthly_rent", "exit_price"]:
        val = file_yaml.get(f)
        if val is None or str(val).strip() == "":
            issues.append(f"Missing market evidence: '{f}' must not be blank (use '정보 없음' if data is unavailable)")
        else:
            val_str = str(val).strip()
            if val_str in ["정보 없음", "메모 없음"]:
                warnings.append(f"Market evidence warning: '{f}' is placeholder '{val_str}'")
            else:
                num_val = to_number(val)
                if num_val is None or num_val < 0:
                    issues.append(f"Missing market evidence: '{f}' must be a valid number or '정보 없음'")
            
    # 5. Heading / User-owned Sections existence check
    checked["headings"] = True
    file_headings = extract_headings(body_text)
    for required_h in schema["required_headings"]:
        if required_h not in file_headings:
            if required_h in USER_OWNED_SECTIONS:
                issues.append(f"Missing user-owned section: '{required_h}'")
            else:
                issues.append(f"Missing required heading: '{required_h}'")
                
    # 6. Baseline changes detection
    if baseline_data and rel_path in baseline_data:
        checked["baseline_comparison"] = True
        file_baseline = baseline_data[rel_path]
        for sec in USER_OWNED_SECTIONS:
            sec_content = extract_section_content(body_text, sec)
            sec_hash = calculate_hash(sec_content)
            if file_baseline.get(sec) != sec_hash:
                warnings.append(f"Baseline mismatch: user-owned section '{sec}' was modified")
                modified_sections.append(sec)
                
    validation_status = "passed" if len(issues) == 0 else "failed"
    return {
        "validation": validation_status,
        "issues": issues,
        "warnings": warnings,
        "checked": checked,
        "modified_sections": modified_sections
    }

def main():
    ensure_directories()
    
    args = sys.argv[1:]
    
    # Check CLI options
    is_create_baseline = False
    if "--create-baseline" in args:
        is_create_baseline = True
        args.remove("--create-baseline")
        
    is_baseline_compare = False
    orig_path = None
    upd_path = None
    if "--baseline" in args:
        is_baseline_compare = True
        idx = args.index("--baseline")
        if idx + 2 < len(args):
            orig_path = args[idx + 1]
            upd_path = args[idx + 2]
            # Remove --baseline and its two arguments
            args.pop(idx)
            args.pop(idx)
            args.pop(idx)
        else:
            print(json.dumps({"error": "--baseline requires two arguments: ORIGINAL and UPDATED"}, indent=2, ensure_ascii=False))
            sys.exit(1)
            
    try:
        schema, cache_used = get_template_schema()
    except Exception as e:
        print(json.dumps({"error": f"Failed to load template schema: {e}"}, indent=2, ensure_ascii=False))
        sys.exit(1)
        
    # Determine target files
    if len(args) > 0:
        files = args
    else:
        if is_baseline_compare:
            if os.path.isdir(upd_path):
                files = []
                for root, _, fs in os.walk(upd_path):
                    for f in fs:
                        if f.endswith('.md'):
                            files.append(os.path.join(root, f))
            else:
                files = [upd_path]
        else:
            auction_dir = os.path.join(BASE_DIR, "PARA/PROJECTS/Auction")
            if os.path.exists(auction_dir):
                files = [os.path.join(auction_dir, f) for f in os.listdir(auction_dir) if f.endswith('.md')]
            else:
                files = []
                
    # Load or compile baseline data
    baseline_data = None
    if is_baseline_compare:
        baseline_data = {}
        if os.path.isdir(orig_path) and os.path.isdir(upd_path):
            for file in files:
                rel = os.path.relpath(file, upd_path)
                orig_file_path = os.path.join(orig_path, rel)
                if os.path.exists(orig_file_path):
                    try:
                        with open(orig_file_path, 'r', encoding='utf-8') as file_f:
                            orig_content = file_f.read()
                        _, orig_body = split_markdown(orig_content)
                        file_hashes = {}
                        for sec in USER_OWNED_SECTIONS:
                            sec_content = extract_section_content(orig_body, sec)
                            file_hashes[sec] = calculate_hash(sec_content)
                        baseline_data[rel] = file_hashes
                    except Exception:
                        pass
        elif os.path.isfile(orig_path) and os.path.isfile(upd_path):
            rel = os.path.basename(upd_path)
            try:
                with open(orig_path, 'r', encoding='utf-8') as file_f:
                    orig_content = file_f.read()
                _, orig_body = split_markdown(orig_content)
                file_hashes = {}
                for sec in USER_OWNED_SECTIONS:
                    sec_content = extract_section_content(orig_body, sec)
                    file_hashes[sec] = calculate_hash(sec_content)
                baseline_data[rel] = file_hashes
            except Exception:
                pass
    elif not is_create_baseline and os.path.exists(BASELINE_FILE):
        try:
            with open(BASELINE_FILE, 'r', encoding='utf-8') as f:
                baseline_data = json.load(f)
        except Exception:
            pass
            
    results = []
    new_baseline_data = {}
    valid_count = 0
    errors_count = 0
    warnings_count = 0
    
    for file in files:
        if is_baseline_compare:
            if os.path.isdir(upd_path):
                rel_path = os.path.relpath(file, upd_path)
            else:
                rel_path = os.path.basename(file)
        else:
            rel_path = os.path.relpath(file, BASE_DIR)
            
        if is_create_baseline:
            try:
                with open(file, 'r', encoding='utf-8') as f:
                    content = f.read()
                _, body_text = split_markdown(content)
                file_hashes = {}
                for sec in USER_OWNED_SECTIONS:
                    sec_content = extract_section_content(body_text, sec)
                    file_hashes[sec] = calculate_hash(sec_content)
                new_baseline_data[rel_path] = file_hashes
            except Exception:
                pass
                
        # Perform validation
        res = validate_file(file, rel_path, schema, baseline_data)
        
        results.append({
            "file": rel_path,
            "validation": res["validation"],
            "issues": res["issues"],
            "warnings": res["warnings"],
            "modified_sections": res["modified_sections"],
            "checked": res["checked"]
        })
        
        if res["validation"] == "passed":
            valid_count += 1
        errors_count += len(res["issues"])
        warnings_count += len(res["warnings"])
        
    # Save baseline if in create-baseline mode
    if is_create_baseline:
        with open(BASELINE_FILE, 'w', encoding='utf-8') as f:
            json.dump(new_baseline_data, f, indent=2, ensure_ascii=False)
            
    validation_status = "passed" if valid_count == len(files) else "failed"
    
    output = {
        "processed_count": len(files),
        "files": results,
        "summary": {
            "checked": len(files),
            "validation": validation_status,
            "issues": errors_count,
            "warnings": warnings_count,
            "cache_used": cache_used
        }
    }
    
    print(json.dumps(output, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
