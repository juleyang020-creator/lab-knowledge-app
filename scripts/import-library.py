"""Import read-only primary PDFs; no OCR, medical rewriting, uploads or duplicate fragments."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def build_manifest(inventory):
    documents = []
    for entry in inventory['documents']:
        source = entry['primary_pdf']
        path = Path(source['absolute_path'])
        if digest(path) != source['sha256']:
            raise ValueError(f'Source changed since inventory: {path.name}')
        match = re.fullmatch(r'(\d+)-(.+)-人卫(\d+)-(第\d+版)', entry['document_id'])
        if match:
            number, title, year, edition = match.groups()
            identifier = f'book-{number}'
            source_id = 'biochem-2025' if number == '98' else identifier
        else:
            if entry['location_kind'] != 'root_level_manual':
                raise ValueError(f'Unrecognized document: {entry["document_id"]}')
            identifier, source_id = 'xwh-manual-2026', 'xwh-manual-2026'
            title, year, edition = '标本采集手册', '2026', '2026版'
        with pymupdf.open(path) as pdf:
            if len(pdf) != source['page_count'] or pdf.is_encrypted:
                raise ValueError(f'PDF identity or access mismatch: {path.name}')
            outline = [
                {'title': name, 'page': page, 'level': level}
                for level, name, page in pdf.get_toc()
                if 1 <= page <= len(pdf) and not re.fullmatch(r'\s*\d+\s*', name)
            ]
        documents.append({
            'id': identifier, 'sourceId': source_id, 'title': title,
            'edition': edition, 'year': int(year), 'pages': source['page_count'],
            'bytes': source['bytes'], 'sha256': source['sha256'],
            'asset': f'library/{identifier}.pdf', 'outline': outline,
            'imageOnly': source['text_layer']['nonempty_pages'] == 0,
            'textSearch': 'not-indexed',
        })
    if len({doc['id'] for doc in documents}) != len(documents):
        raise ValueError('Duplicate document identity')
    totals = {
        'documents': len(documents),
        'pages': sum(doc['pages'] for doc in documents),
        'bytes': sum(doc['bytes'] for doc in documents),
    }
    if totals['documents'] != inventory['summary']['primary_document_count']:
        raise ValueError('Primary document coverage is incomplete')
    if totals['pages'] != inventory['summary']['primary_pdf_pages']:
        raise ValueError('Primary page coverage is incomplete')
    return {'version': 1, 'documents': documents, 'totals': totals}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    inventory = json.loads((ROOT / 'docs/审核/library-inventory.json').read_text())
    manifest = build_manifest(inventory)
    target = ROOT / 'public/library'
    if not args.check:
        target.mkdir(parents=True, exist_ok=True)
    for original, doc in zip(inventory['documents'], manifest['documents']):
        source = Path(original['primary_pdf']['absolute_path'])
        destination = ROOT / 'public' / doc['asset']
        if not args.check and (not destination.exists() or digest(destination) != doc['sha256']):
            temporary = destination.with_suffix('.pdf.tmp')
            # APFS clone saves local space without a mutable symlink to the original library.
            if sys.platform == 'darwin':
                result = subprocess.run(['cp', '-c', str(source), str(temporary)], check=False)
                if result.returncode:
                    shutil.copyfile(source, temporary)
            else:
                shutil.copyfile(source, temporary)
            if digest(temporary) != doc['sha256']:
                raise ValueError(f'Copy checksum mismatch: {doc["id"]}')
            temporary.replace(destination)
        if not destination.is_file() or digest(destination) != doc['sha256']:
            raise ValueError(f'Imported PDF missing or changed: {doc["id"]}')
    index = target / 'index.json'
    if args.check:
        if json.loads(index.read_text()) != manifest:
            raise ValueError('Library manifest does not match the complete source library')
    else:
        index.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    catalog_path = ROOT / 'public/content/catalog.json'
    catalog = json.loads(catalog_path.read_text())
    for doc in manifest['documents']:
        source = next((s for s in catalog['sources'] if s['id'] == doc['sourceId']), None)
        if args.check:
            if not source or source.get('asset') != doc['asset'] or source['pdfPages'] != doc['pages']:
                raise ValueError(f'Citation asset mismatch: {doc["sourceId"]}')
        else:
            if source is None:
                source = {'id': doc['sourceId'], 'title': doc['title'], 'edition': doc['edition'],
                          'publisher': '人民卫生出版社', 'year': doc['year'],
                          'pdfPages': doc['pages'], 'kind': 'textbook'}
                catalog['sources'].append(source)
            source['asset'] = doc['asset']
    if not args.check:
        catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'mode': 'check' if args.check else 'import', **manifest['totals'],
                      'primaryPdfsVerified': True, 'medicalRewriting': False,
                      'fullTextIndexCreated': False, 'uploaded': False}, ensure_ascii=False))


if __name__ == '__main__':
    main()
