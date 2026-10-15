import * as migration_20261015_174323_inicial from './20261015_174323_inicial';

export const migrations = [
  {
    up: migration_20261015_174323_inicial.up,
    down: migration_20261015_174323_inicial.down,
    name: '20261015_174323_inicial'
  },
];
