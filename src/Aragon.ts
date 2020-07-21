import { connect } from '@aragon/connect'
// import {Voting} from '@aragon/connect-thegraph-voting'
import {VotingConnectorTheGraph} from '@aragon/connect-thegraph-voting'
import {Response} from "express";

const tokensRequestAppAddress = "0xd627029793f101158cf5cb85c55f12764f2288d7"
const votingAppAddress = "0x759e6b2d838c9261c570bba8175eba302a0a1d7c"
const orgAddress = "0xabcBe9521Da51504D5dc8F3f7D0d0F5BbDC65548"


export default class Aragon {

  static async NewTokenProposal(req:Request, res:Response){
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })
    // const address = (await org.app('token-request')).address;
    // const tokenManager = new TokenManager(
    //   address,
    //   // '0xdc39bd1f597e89db4a806d57ba8f4811396a66ba',
    //   'https://api.thegraph.com/subgraphs/name/aragon/aragon-tokens-rinkeby'
    // )
    // const tokenRequest = await org.app('token-request');
    const timestamp = req.body["timestamp"];
    const url = req.body["url"];
    console.log("proposal details:", url, timestamp);

    const userAddress = req.body["userAddress"];
    console.log("new aragon vote request from user address:", userAddress)

    const proposalDetails = JSON.stringify({timestamp:timestamp, url:url});
    const intent = org.appIntent(
      tokensRequestAppAddress,
      'createTokenRequest', [
      "0x0000000000000000000000000000000000000000",
        '0', '0',
        proposalDetails
    ])

    const path = await intent.paths(userAddress)
    console.log(path);
    if (path == undefined || !path){
      res.status(404).send(JSON.stringify({"error":"no possible path to vote"}))
      return;
    }
    console.log("paths:",path);
    // return shortest path
    res.status(200).send(JSON.stringify(path));
  }



  static async Connect(req:Request, res:Response) {
    // Connect to the Rinkeby test network
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })

    const apps = await org.apps();
    const { address } = apps.find(app => app.appName.includes("voting"));
    console.log("address:",address);
    // Instantiate the Voting app connector using the app address:
    const votes = await (new VotingConnectorTheGraph('https://api.thegraph.com/subgraphs/name/aragon/aragon-voting-rinkeby'))
      .votesForApp(
      address,
      10,0)


    // Fetch votes of the Voting app
    // const votes = await voting.votes();
    console.log("votes:",votes);
    let proposalToVoteOn = null;

    const topicTimeStamp = req.body["timestamp"];
    for (const vote of votes){
      if (vote.metadata.includes(topicTimeStamp)){
        proposalToVoteOn = vote;
        break;
      }
    }
    if (!proposalToVoteOn){
      res.status(404).send(JSON.stringify({"error":"vote note found"}))
      return;
    }

    // TODO: this only checks if the vote has been passed already, what about expired??
    if (proposalToVoteOn.executed){
      res.status(404).send(JSON.stringify({"error":"vote already passed"}))
      return;
    }
    const preference = req.body["vote"];
    const latestVoteID = proposalToVoteOn.id.split("voteId:")[1];
    const intent = await org.appIntent(
      votingAppAddress,
      'vote',
      [latestVoteID, preference=="yes", true]
    )

    // The first path is the shortest
    const userAddress = req.body["userAddress"];
    console.log("new aragon vote request from user address:", userAddress)

    const path = await intent.paths(userAddress)
    if (path == undefined || !path){
      res.status(404).send(JSON.stringify({"error":"no possible path to vote"}))
      return;
    }
    console.log("paths:",path);
    // return shortest path
    res.status(200).send(JSON.stringify(path));
    // console.log("paths:",paths);
  }
}
