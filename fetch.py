#!/usr/bin/env python3

import json
import sys
from urllib import request

SERVER = 'https://results.webkit.org/api/results/layout-tests'

def main(argv=None):
    if argv is None:
        argv=sys.argv

    with open('bots.json') as handle:
        data = json.load(handle)


    for platform, query in data.items():
        print(platform, query)

        outfilename = 'layout-tests-{}.json'.format(platform)
        print('Saving to {}'.format(outfilename))

        with request.urlopen('{}?{}'.format(SERVER, query)) as response:
            print('Fetching {}...'.format(platform))
            data = response.read()
            with open(outfilename, 'wb') as handle:
                print('Saving to {}'.format(outfilename))
                handle.write(data)

if __name__ == "__main__":
    main()
