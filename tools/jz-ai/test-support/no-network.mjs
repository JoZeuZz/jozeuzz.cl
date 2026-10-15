import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import dgram from 'node:dgram';
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';

const log = process.env.JZAI_NET_LOG;
const block = (name) => function blocked() {
  if (log) appendFileSync(log, `${name}\n`);
  throw new Error(`red bloqueada: ${name}`);
};

// net.Socket.prototype.connect es el punto común de net, tls, http, https y fetch (undici);
// verificado en Node 20.19.2. Las demás sustituciones registran el intento con un nombre más claro.
net.Socket.prototype.connect = block('net.Socket.connect');
net.connect = block('net.connect');
net.createConnection = block('net.createConnection');
tls.connect = block('tls.connect');
globalThis.fetch = block('fetch');
dns.lookup = block('dns.lookup');
dns.promises.lookup = block('dns.promises.lookup');
dgram.createSocket = block('dgram.createSocket');
syncBuiltinESMExports();
