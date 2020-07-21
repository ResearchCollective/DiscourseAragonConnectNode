const nodeFetch = require("node-fetch");

export default class Proposals{

  static async GenerateProposal (req, res){

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
    await nodeFetch(telegramEndpointHumanReadable, requestOptions)
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

    const jsonResponse = await nodeFetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', pinataRequestOptions)
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

    await nodeFetch(telegramIPFSHashMsg, requestOptions)
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

  }
}
