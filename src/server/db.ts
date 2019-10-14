import { JsonDB } from 'node-json-db';
import { Config } from 'node-json-db/dist/lib/JsonDBConfig'

import pathlib from 'path';

const dbFilename = (process.env.NODE_ENV === 'development')
	? pathlib.join(__dirname, '..', '..', 'db.json') // We're in serial-bridge/dist/server; db is serial-bridge/db.json
	: pathlib.join(pathlib.dirname(process.argv[1]), 'db.json'); // Same directory as main script

export default new JsonDB(new Config(dbFilename, true, true, '/'));
