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
        default=None)

    return parser.parse_args()

def main():

    args = parse_args()
    mydir = os.path.dirname(os.path.abspath(__file__))

    if args.dest_dir and not os.path.isdir(args.dest_dir):
        print("Destination must be a valid directory")
        sys.exit(1)
    elif not args.dest_dir:
        args.dest_dir = mydir

    with open(os.path.join(mydir, 'bots.json')) as handle:
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
