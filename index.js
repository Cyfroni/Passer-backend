const multiaddr = require('multiaddr')
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const log = require("log");
const {Node} = require('./node')

const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})  

function createPeer(callback) {
  // create a new PeerInfo object with a newly-generated PeerId
  PeerInfo.create((err, peerInfo) => {
    if (err) {
      return callback(err)
    }

    // add a listen address to accept TCP connections on a random port
    const bootstrap_node = process.argv[2]
    const listenAddress = multiaddr(`/ip4/0.0.0.0/tcp/0`)
    peerInfo.multiaddrs.add(listenAddress)

    const peer = new Node({peerInfo}, [bootstrap_node])
    // register an event handler for errors.
    // here we're just going to print and re-throw the error
    // to kill the program
    peer.on('error', err => {
      console.error('libp2p error: ', err)
      throw err
    })

    peer.on('peer:connect', (peer2) => {
    	console.log('Connection established to:', peer2.id.toB58String())
	    const key = Buffer.from('hello-key')
	    const value = Buffer.from('hello-value')
	    peer.dht.put(key, value)
	    peer.dht.get(key, (err, buffer) => {
      		console.log('DHT is ' + buffer)
	    })
    })

    callback(null, peer)
  })
}

function handleStart(peer) {
      // get the list of addresses for our peer now that it's started.
      // there should be one address of the form
      // `/ip4/127.0.0.1/tcp/${assignedPort}/ipfs/${generatedPeerId}`,
      // where `assignedPort` is randomly chosen by the operating system
      // and `generatedPeerId` is generated in the `createPeer` function above.
      const addresses = peer.peerInfo.multiaddrs.toArray()
      console.log('peer started. listening on addresses:')
      addresses.forEach(addr => console.log(addr.toString()))

      if (process.argv[3]){
	      console.log('Trying to discover peers')
        discoverBootstrapPeer(process.argv[3], peer)
      }
}


async function discoverBootstrapPeer(candidate, peer){
      const ma = multiaddr(candidate)

      const peerId = PeerId.createFromB58String(ma.getPeerId())

      try {
        const peerInfo = new PeerInfo(peerId)
        peerInfo.multiaddrs.add(ma)
	      peer.dial(peerInfo, (err, conn) => {
		    if (err) { throw err }
		      peer.peerRouting.findPeer(peerId, (err, peer2) => {
      			  if (err) { throw err }
      			  console.log('Found it, multiaddrs are:')
      			  peer2.multiaddrs.forEach((ma) => console.log(ma.toString()))
    		})
	})
      } catch (err) {
        log.error('Invalid bootstrap peer id', err)
      }
}

// main entry point
createPeer((err, peer) => {
  if (err) {
    throw err
  }

  peer.start(err => {
    if (err) {
      throw err
    }

    handleStart(peer)
  })
})
