#!/usr/bin/env python3

import json
import sys
from urllib import request

SERVER = 'https://results.webkit.org/api/results/layout-tests'

def normalize_platform_name(name):
    return name
    # sep = '-'
    # return sep.join(token.lower() for token in name.split(sep))

def main(argv=None):
    if argv is None:
        argv=sys.argv

    with open('bots.json') as handle:
        data = json.load(handle)


    for platform, query in data.items():
        print(platform, normalize_platform_name(platform), query)

        outfilename = f'layout-tests-{normalize_platform_name(platform)}.json'
        print(f'Saving to {outfilename}')

        with request.urlopen(f'{SERVER}?{query}') as response:
            print(f'Fetching {platform}...')
            data = response.read()
            with open(outfilename, 'wb') as handle:
                print(f'Saving to {outfilename}')
                handle.write(data)

if __name__ == "__main__":
    main()
