const multiaddr = require("multiaddr");
const PeerInfo = require("peer-info");
const fs = require("fs");
const pull = require("pull-stream");
const { Node } = require("./models/node");
const crypto = require("crypto");
const _ = require("underscore");
const toPull = require("stream-to-pull-stream");
const Readable = require("stream").Readable;
const glob = require("glob");
const Cid = require("cids");

const rl = require("readline").createInterface({
  input: process.stdin,
  output: process.stdout
});

function createPeer(callback) {
  // create a new PeerInfo object with a newly-generated PeerId
  PeerInfo.create((err, peerInfo) => {
    if (err) {
      return callback(err);
    }

    // add a listen address to accept TCP connections on a random port
    const bootstrap_node = process.argv[2];
    const listenAddress = multiaddr(`/ip4/0.0.0.0/tcp/0`);
    peerInfo.multiaddrs.add(listenAddress);

    const peer = new Node({ peerInfo }, [bootstrap_node]);
    // register an event handler for errors.
    // here we're just going to print and re-throw the error
    // to kill the program
    peer.on("error", err => {
      console.error("libp2p error: ", err);
      throw err;
    });

    peer.on("peer:connect", peer2 => {
      console.log("Connection established to:", peer2.id.toB58String());
      const key = Buffer.from("hello-key");
      const value = Buffer.from("hello-value");
      peer.dht.put(key, value);
      peer.dht.get(key, (err, buffer) => {
        console.log("DHT is " + buffer);
      });
    });

    peer.handle("/file/1.0.0", (protocolName, connection) => {
      pull(
        connection,
        pull.collect((err, data) => {
          console.log("received:", data);
          var num = data[0];
          var hash = data[1].toString();
          var shard = data[2].toString();
          var id = peer.peerInfo.id.toB58String();
          fs.writeFile(`shards/${id}_${hash}_${num}`, shard, function(err) {
            if (err) throw err;
            console.log("File is created successfully.");
            // peer.contentRouting.provide(new Cid(1, "raw", data[1]), err => {
            //   if (err) throw err;

            //   console.log("Node %s is providing %s", id, hash);
            // });
          });
        })
      );
    });

    callback(null, peer);
  });
}

function handleStart(peer) {
  // get the list of addresses for our peer now that it's started.
  // there should be one address of the form
  // `/ip4/127.0.0.1/tcp/${assignedPort}/ipfs/${generatedPeerId}`,
  // where `assignedPort` is randomly chosen by the operating system
  // and `generatedPeerId` is generated in the `createPeer` function above.
  const addresses = peer.peerInfo.multiaddrs.toArray();
  console.log("peer started. listening on addresses:");
  addresses.forEach(addr => console.log(addr.toString()));

  rl.setPrompt("command> ");
  rl.prompt();

  rl.on("line", function(line) {
    processCommand(line, peer);
    rl.prompt();
  }).on("close", function() {
    process.exit(0);
  });
}

// main entry point
createPeer((err, peer) => {
  if (err) {
    throw err;
  }

  peer.start(err => {
    if (err) {
      throw err;
    }

    handleStart(peer);
  });
});

function splitString(str, n) {
  var chunks = [];
  var quantity = Math.ceil(str.length / n);
  for (var i = 0, charsLength = str.length; i < charsLength; i += quantity) {
    chunks.push(str.substring(i, i + quantity));
  }
  return chunks;
}

function addMetaData(peer, hash) {
  var key = Buffer.from("0");
  console.log(key);
  peer.dht.get(key, (err, buffer) => {
    console.log(buffer);
    var metaData = buffer ? JSON.parse(buffer) : [];
    metaData.push(hash);
    peer.dht.put(key, Buffer.from(JSON.stringify(metaData)));
  });
}

function processCommand(command, peer) {
  console.log("Command was: " + command);
  args = command.split(" ");
  console.log("Split: " + args[0] + args[1]);

  if (args[0] == "dht") {
    if (args[1] == "put") {
      const key = Buffer.from(args[2]);
      const value = Buffer.from(args[3]);
      peer.dht.put(key, value);
      console.log(`DHT PUT ${key}:${value}`);
    }
    if (args[1] == "get") {
      const key = Buffer.from(args[2]);
      peer.dht.get(key, (err, buffer) => {
        console.log(`DHT GET ${key}:${buffer}`);
      });
    }
  }
  if (args[0] == "store") {
    const data = fs.readFileSync(args[1], "utf8");
    console.log(data);
    const dataHash = crypto
      .createHash("md5")
      .update(data)
      .digest("hex");
    const chunkQuantity = 2;
    const chunks = splitString(data, chunkQuantity);
    var peers = peer.peerBook.getAllArray();
    _.sample(peers, chunkQuantity).forEach((p, i) => {
      var s = new Readable();
      s.push(i.toString());
      s.push(dataHash);
      s.push(chunks[i]);
      s.push(null);

      peer.dialProtocol(p, "/file/1.0.0", (err, connection) => {
        pull(toPull.duplex(s), connection);
      });
    });
    addMetaData(peer, dataHash);
  }
  if (args[0] == "getPeerChunks") {
    var id = peer.peerInfo.id.toB58String();

    glob(`shards/${id}*`, function(er, files) {
      files.forEach(file => {
        console.log(file, "\n", fs.readFileSync(file).toString());
      });
    });
  }
  if (args[0] == "findProviders") {
    // peer.contentRouting.findProviders(new Cid(args[1]), (err, providers) => {
    //   if (err) {
    //     throw err;
    //   }
    //   console.log(
    //     "Found providers:\n",
    //     providers.map(p => p.id.toB58String()).join("\n")
    //   );
    // });
  }
  if (args[0] == "ping") {
    console.log("pong");
  }
}
