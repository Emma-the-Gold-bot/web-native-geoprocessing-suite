#!/usr/bin/env python3
"""
Add intent fields to OPERATION_REGISTRY from OPERATION_INTENT_MAP.
Reads src/lib/operations/registry.ts and src/lib/operations/intent-data.ts,
adds intent fields, writes back.
"""

import re
import os

REGISTRY_PATH = 'src/lib/operations/registry.ts'
INTENT_DATA_PATH = 'src/lib/operations/intent-data.ts'

def extract_operation_ids_from_registry(content):
    """Find all operation IDs in the registry."""
    # Pattern: 'buffer': { ... id: 'buffer', ... }
    # or buffer: { ... id: 'buffer', ... }
    lines = content.split('\n')
    ids = []
    for i, line in enumerate(lines):
        # Look for lines that start with a key (quoted or not)
        match = re.match(r'^\s*[\'"]([a-zA-Z0-9\-]+)[\'"]?\s*:\s*\{', line)
        if match:
            ids.append(match.group(1))
        # Also catch id lines inside the object to verify
    # Filter duplicates
    seen = set()
    unique = []
    for op_id in ids:
        if op_id not in seen:
            seen.add(op_id)
            unique.append(op_id)
    return unique

def extract_intent_map_ids(content):
    """Find all operation IDs in the intent map."""
    # Pattern: 'buffer': {
    lines = content.split('\n')
    ids = []
    for line in lines:
        match = re.match(r'^\s*[\'"]([a-zA-Z0-9\-]+)[\'"]\s*:\s*\{', line)
        if match:
            ids.append(match.group(1))
    return ids

def add_intents_to_registry(registry_content, intent_ids):
    """Insert intent field before the closing brace of each operation definition."""
    lines = registry_content.split('\n')
    output_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        output_lines.append(line)
        # Look for start of an operation definition
        match = re.match(r'^\s*[\'"]([a-zA-Z0-9\-]+)[\'"]?\s*:\s*\{', line)
        if match:
            op_id = match.group(1)
            # Find the matching closing brace
            brace_count = 1
            j = i + 1
            while j < len(lines) and brace_count > 0:
                next_line = lines[j]
                # Count braces in this line (simple)
                brace_count += next_line.count('{') - next_line.count('}')
                j += 1
            # Now j is at the line after the closing brace
            # Insert intent field before that line (j-1)
            # We'll mark the position and add later
            if op_id in intent_ids:
                # Find where to insert - before the line that contains just '},' or '}'
                # Actually easier: we'll process after gathering all lines
                pass
        i += 1
    
    # Simpler approach: just append intent field before the final '},' of each object
    # Let's do a regex substitution
    for op_id in intent_ids:
        # Pattern: the object ends with something like:
        #     uiHints: { ... },
        #   },
        # We'll insert before that final closing brace line
        pattern = rf"(\s+uiHints\s*:\s*{{[^}}]+}},\s*)(\n\s*}},\s*)"
        # Actually better: find the block for this operation
        pass
    
    # Instead, let's do line-by-line with a state machine
    lines = registry_content.split('\n')
    output = []
    i = 0
    while i < len(lines):
        line = lines[i]
        output.append(line)
        # Detect start of operation
        match = re.match(r'^\s*[\'"]([a-zA-Z0-9\-]+)[\'"]?\s*:\s*\{', line)
        if match:
            op_id = match.group(1)
            # Skip forward to find where uiHints ends
            j = i + 1
            while j < len(lines):
                inner_line = lines[j]
                # Look for the closing brace of this object
                if inner_line.strip() == '},' or inner_line.strip() == '}':
                    # Found the end, insert intent before this line
                    if op_id in intent_ids:
                        indent = ' ' * (len(inner_line) - len(inner_line.lstrip()))
                        output.append(f'{indent}intent: OPERATION_INTENT_MAP[\'{op_id}\'],')
                    break
                j += 1
        i += 1
    
    return '\n'.join(output)

def main():
    with open(REGISTRY_PATH, 'r') as f:
        registry = f.read()
    
    with open(INTENT_DATA_PATH, 'r') as f:
        intent_data = f.read()
    
    op_ids = extract_operation_ids_from_registry(registry)
    intent_ids = extract_intent_map_ids(intent_data)
    
    print(f"Found {len(op_ids)} operations in registry: {op_ids}")
    print(f"Found {len(intent_ids)} intents in map: {intent_ids}")
    
    # Check which ops have intents
    missing = [op for op in op_ids if op not in intent_ids]
    if missing:
        print(f"Warning: operations without intents: {missing}")
    
    # Add intents
    new_registry = add_intents_to_registry(registry, intent_ids)
    
    # Write backup
    backup = REGISTRY_PATH + '.bak'
    with open(backup, 'w') as f:
        f.write(registry)
    print(f"Backup written to {backup}")
    
    with open(REGISTRY_PATH, 'w') as f:
        f.write(new_registry)
    print(f"Updated {REGISTRY_PATH} with intent fields")

if __name__ == '__main__':
    main()