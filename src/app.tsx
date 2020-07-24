// imports
import Email from './Email';
import Proposals from "./Proposals";
import Aragon from "./Aragon";

require('dotenv').config();
const express = require('express');
const fs = require('fs');
// const misc = require("@docknetwork/sdk/utils/misc");
const getKeyDocHelper = require("@docknetwork/sdk/utils/vc/helpers");
const VC = require("@docknetwork/sdk/verifiable-credential");
const CONTEXT_JSON = require("../public/context-json-ld.json");
const elliptic = require('elliptic');
const secp256k1Curve = new elliptic.ec('secp256k1');


// Variables
const APP = express();
const PORT = 3001;
let KEY_DOC = null;


// Server Config
APP.use(function(_req, res, next) {
  res.header("Access-Control-Allow-Origin", "http://localhost:3000"); // update to match the domain you will make the request from
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
APP.use(express.json());


// Load the server keys
function getKeyDoc():void{
  fs.readFile('./keypair.json', 'utf-8', (err, data) => {
    if(err) { throw err; }
    // keys generated via:
    // const keyPair = misc.generateEcdsaSecp256k1Keypair();
    const privateKey = JSON.parse(data)["priv"];
    const keyPair = secp256k1Curve.keyFromPrivate(privateKey,16);
    KEY_DOC = getKeyDocHelper(process.env.DAO_DID, keyPair, "EcdsaSecp256k1VerificationKey2019");
  });
}

APP.post('/submitNewAragonVote', Aragon.NewVoteProposal)

APP.post('/submitNewAragonTokenRequest', Aragon.NewTokenProposal)

APP.post('/getVoteTransaction', Aragon.VoteOnProposal)

// Used to submit a proposal to the telegram channel
APP.post('/submitNewProposal', Proposals.GenerateProposal);

// DEPRECATED
APP.post('/signCredential', async function (_req, res) {
  res.send("deprecated, use /signCredentialAndEmail")
});


// Use to sign a verifiable claim if it passes the DAO vote
// ACCEPTS: Post data should be the credential and a contactEmail
APP.post('/signCredentialAndEmail', async function (req, res) {
  const email = req.body["contactEmail"];
  const vc = VC.fromJSON(req.body["credential"]);
  // console.log(vc);
  await vc.sign(KEY_DOC);
  console.log("verified credential proof:",vc.proof);
  res.send(vc);
  const response = await Email.SendEmail(email, JSON.stringify(vc));
  console.log("mailgun response:",response);
});



// Supplies the verifiable claim's context: ResearchCollectiveExpertDAOResource
APP.get('/credentials/v1', function (_req, res) {
  console.log("Got a  credential request");
  // console.log("contextFile:", CONTEXT_JSON);
  res.send(CONTEXT_JSON)
});

// Aragon.NewTokenProposal();
// load the signing keys then start the server
getKeyDoc();
APP.listen(PORT, () => console.log(`listening at http://localhost:${PORT}`));
