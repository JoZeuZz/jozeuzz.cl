import * as migration_20261015_174323_inicial from './20261015_174323_inicial';
import * as migration_20261016_055416_poc1b from './20261016_055416_poc1b';
import * as migration_20261017_120000_poc3_intake from './20261017_120000_poc3_intake';

export const migrations = [
  {
    up: migration_20261015_174323_inicial.up,
    down: migration_20261015_174323_inicial.down,
    name: '20261015_174323_inicial',
  },
  {
    up: migration_20261016_055416_poc1b.up,
    down: migration_20261016_055416_poc1b.down,
    name: '20261016_055416_poc1b'
  },
  {
    up: migration_20261017_120000_poc3_intake.up,
    down: migration_20261017_120000_poc3_intake.down,
    name: '20261017_120000_poc3_intake'
  },
];
