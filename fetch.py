#!/usr/bin/env python3

import argparse
import json
import os
import sys
from urllib import request

SERVER = 'https://results.webkit.org/api/results/layout-tests'

def parse_args():
    parser = argparse.ArgumentParser()

    parser.add_argument('-d', '--dest-dir', metavar='DEST', help='Destination directory',
        default=os.getcwd())

    return parser.parse_args()

def main():

    args = parse_args()

    if not os.path.isdir(args.dest_dir):
        print("Destination must be a valid directory")
        sys.exit(1)

    with open('bots.json') as handle:
        data = json.load(handle)


    for platform, query in data.items():
        print(platform, query)

        outfilename = os.path.join(args.dest_dir, 'layout-tests-{}.json'.format(platform))
        print('Saving to {}'.format(outfilename))

        with request.urlopen('{}?{}'.format(SERVER, query)) as response:
            print('Fetching {}...'.format(platform))
            data = response.read()
            with open(outfilename, 'wb') as handle:
                print('Saving to {}'.format(outfilename))
                handle.write(data)

if __name__ == "__main__":
    main()
