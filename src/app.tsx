// imports
import Email from './Email';

require('dotenv').config();
const express = require('express');
const fs = require('fs');
// const misc = require("@docknetwork/sdk/utils/misc");
const getKeyDocHelper = require("@docknetwork/sdk/utils/vc/helpers");
const VC = require("@docknetwork/sdk/verifiable-credential");
const CONTEXT_JSON = require("../public/context-json-ld.json");
const elliptic = require('elliptic');
const secp256k1Curve = new elliptic.ec('secp256k1');
const nodefetch = require("node-fetch");


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


// Used to submit a proposal to the telegram channel
APP.post('/submitNewProposal', async function (req, res){

  const requestOptions = { method: 'GET', };

  const humanReadableMessage =
    "New Proposal Alert! \n" +
    "Submitted by: " + req.body["contactName"] + "\n" +
    "Email: " + req.body["contactEmail"] + "\n" +
    "IPFS GATEWAY URL FOR JSON CREDENTIAL FOLLOWS: \n";

  const telegramEndpointHumanReadable =
    "https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_API +
    "/sendMessage?chat_id=" + process.env.CHANNEL_NAME +
    "&text=" + humanReadableMessage;

  // send the new proposal notification to Telegram
  await nodefetch(telegramEndpointHumanReadable, requestOptions)
    .then(async response =>
    {
      console.log("telegram human message response:", response);
      res.send("proposal sent")
    }).catch(err=>
    {
      console.log("error on telegram human message request:", err);
      res.send(err)
    });

  // pin the VC
  const pinataRequestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'pinata_api_key':process.env.PINATA_API_KEY,
      'pinata_secret_api_key': process.env.PINATA_SECRET_API_KEY,
    },
    body: JSON.stringify(req.body)
  };

  const jsonResponse = await nodefetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', pinataRequestOptions)
    .then(async response =>
    {
      const jsonResponse = await response.json();
      console.log("credential pinned at hash:", jsonResponse["IpfsHash"]);
      return jsonResponse;

    }).catch(err=>{
      console.log("error on ipfs request:", err);
      return null;
    });

  if (jsonResponse == null){
    return;
  }

  // send the Pinned VC Hash to the Telegram channel
  const telegramIPFSHashMsg =
    "https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_API +
    "/sendMessage?chat_id=" + process.env.CHANNEL_NAME +
    "&text=" + 'https://gateway.pinata.cloud/ipfs/' + jsonResponse["IpfsHash"];

  await nodefetch(telegramIPFSHashMsg, requestOptions)
    .then(async response =>
    {
      console.log("telegram ipfs message response:", response);
    }).catch(err=>
    {
      console.log("error on telegram ipfs message request:", err);
    });

  // const proposedCredentialJSON = JSON.stringify(req.body["credential"], null, 2);
  // const telegramEndpointJSON =
  //   "https://api.telegram.org/bot" + process.env.TELEGRAM_BOT_API +
  //   "/sendMessage?chat_id=" + process.env.CHANNEL_NAME +
  //   "&text=" + proposedCredentialJSON;
  //
  // // send the VC in JSON to Telegram
  // nodefetch(telegramEndpointJSON, requestOptions)
  //   .then(async response =>
  //   {
  //     console.log("telegram JSON response:", response);
  //   }).catch(err=>
  // {
  //   console.log("error on telegram JSON request:", err);
  // });

});


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


// load the signing keys then start the server
getKeyDoc();
APP.listen(PORT, () => console.log(`listening at http://localhost:${PORT}`));
