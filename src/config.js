const TCP = require("libp2p-tcp")
const WS = require("libp2p-websockets")
const SPDY = require("libp2p-spdy")
const MPLEX = require("libp2p-mplex")
const MulticastDNS = require("libp2p-mdns")
const DHT = require("libp2p-kad-dht")
const GossipSub = require("libp2p-gossipsub")

module.exports = {
  // The libp2p modules for this libp2p bundle
  modules: {
    transport: [TCP],
    streamMuxer: [MPLEX],
    peerDiscovery: [MulticastDNS],
    dht: DHT, // DHT enables PeerRouting, ContentRouting and DHT itself components
    pubsub: GossipSub
  },

  // libp2p config options (typically found on a config.json)
  config: {
    // The config object is the part of the config that can go into a file, config.json.
    peerDiscovery: {
      autoDial: true, // Auto connect to discovered peers (limited by ConnectionManager minPeers)
      mdns: {
        // mdns options
        interval: 1000, // ms
        enabled: true
      },
      webrtcStar: {
        // webrtc-star options
        interval: 1000, // ms
        enabled: false
      }
      // .. other discovery module options.
    },
    relay: {
      // Circuit Relay options
      enabled: true,
      hop: {
        enabled: false,
        active: false
      }
    },
    dht: {
      enabled: true
    },
    pubsub: {
      enabled: true,
      emitSelf: true, // whether the node should emit to self on publish, in the event of the topic being subscribed
      signMessages: true, // if messages should be signed
      strictSigning: true // if message signing should be required
    }
  }
}
