const KadDHT = require("libp2p-kad-dht");
const Libp2p = require("libp2p");
const TCP = require("libp2p-tcp");
const SPDY = require("libp2p-spdy");
const Multiplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const Bootstrap = require("libp2p-bootstrap");

const defaultsDeep = require("@nodeutils/defaults-deep");

const bootstrapers = [];

const DEFAULT_OPTS = {
  modules: {
    transport: [TCP],
    connEncryption: [SECIO],
    streamMuxer: [Multiplex],
    peerDiscovery: [Bootstrap],
    dht: KadDHT
  },
  config: {
    dht: {
      // dht must be enabled
      enabled: true,
      kBucketSize: 20
    },
    peerDiscovery: {
      autoDial: true,
      bootstrap: {
        interval: 20e3,
        enabled: true,
        list: bootstrapers
      }
    }
  }
};

class Node extends Libp2p {
  constructor(opts, bootstrap_list) {
    const bootstrap_opts = DEFAULT_OPTS;
    bootstrap_opts.config.peerDiscovery.bootstrap.list = bootstrap_list;
    super(defaultsDeep(opts, bootstrap_opts));
  }
}

module.exports = { Node };
