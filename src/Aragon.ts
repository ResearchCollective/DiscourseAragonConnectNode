import { connect, describeScript } from '@aragon/connect'
// import {Voting} from '@aragon/connect-thegraph-voting'
import {DandelionVoting} from '@1hive/connect-app-dandelion-voting'
import {Response} from "express";
import {asyncFilter, sendAndLogError} from "./utils";

const orgAddress = "0x08f7771f48673df8E3e22a892661BF06D01fc1f5"
const VOTE_DURATION = 24 * 60 * 60 * 1000; // ms

export default class Aragon {

  static async NewVote(req:Request, res:Response){
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })

    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"])
    console.log("proposal details:",aragonVote);

    const apps = await org.apps();
    const { address } = apps.find(app => app.appName.includes("voting"));

    const intent = org.appIntent(
      address,
      'newVote',
      ["0x", aragonVote.GetJSON(), false]
    )

    const path = await intent.paths(aragonVote.posterAddress)
    console.log(path);
    if (path == undefined || !path){
      sendAndLogError(res,"no possible path to vote")
      return;
    }
    console.log("paths:",path);
    // return shortest path
    res.status(200).send(JSON.stringify(path));
  }

  static async NewTokenProposal(req:Request, res:Response){
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })

    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"])
    console.log("proposal details:",aragonVote);

    const apps = await org.apps();
    const { address } = apps.find(app => app.appName.includes("token-request"));

    const intent = org.appIntent(
      address,
      'createTokenRequest',
      ["0x0000000000000000000000000000000000000000", '0', '0', aragonVote.GetJSON()]
    )

    const path = await intent.paths(aragonVote.posterAddress)
    console.log(path);
    if (path == undefined || !path){
      sendAndLogError(res,"no possible path to vote")
      return;
    }
    console.log("paths:",path);
    // return shortest path
    res.status(200).send(JSON.stringify(path));
  }



  static async VoteOnProposal(req:Request, res:Response) {
    // Connect to the Rinkeby test network
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })
    const apps = await org.apps();
    const { address } = apps.find(app => app.appName.includes("voting"));

    const voting = new DandelionVoting(
      address,
      'https://api.thegraph.com/subgraphs/name/1hive/aragon-dandelion-voting-rinkeby'
      )

    const votes = await voting.votes();
    // console.log("votes:",votes);

    // find vote with matching timestamp and poster
    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"].toLowerCase());

    // TODO: select properly for a vote on a simple vote vs. token request vote -
    //a vote intended for a simple vote will catch token request votes as well by the same member
    const votesWithMatchingMetadata = await asyncFilter(votes, async (vote)=>{
      const { script } = vote
      console.log("metadata for vote:", vote.metadata)
      if (vote.metadata.length==0) {
        const description = await describeScript(script, apps, org.provider)
        return description[0].description.toLowerCase().includes(aragonVote.posterAddress);
      }
      console.log("json:",aragonVote.GetJSON())
      console.log("json:",vote.metadata.includes(aragonVote.GetJSON()))
      return vote.metadata.includes(aragonVote.GetJSON());
    })

    console.log("matching votes:",votesWithMatchingMetadata);

    const matchingOpenVotes = await asyncFilter(votesWithMatchingMetadata, async (vote)=> {
      const voteStartTime = await getMSFromBlockNumber(vote.startBlock).catch(e=>{
        console.log("infura error:", e);
        sendAndLogError(res,"error on get block time")
        return;
      });
      return Date.now() < (voteStartTime + VOTE_DURATION)  && !vote.executed
    })

    if (matchingOpenVotes.length==0){
      sendAndLogError(res,"vote not found or expired already")
      return;
    }

    if (matchingOpenVotes.length>1){
      sendAndLogError(res,"too many matching votes")
      return;
    }
    const proposalToVoteOn = matchingOpenVotes[0];
    const preference = req.body["vote"];
    const latestVoteID = proposalToVoteOn.id.split("voteId:")[1];
    const intent = await org.appIntent(
      address,
      'vote',
      [latestVoteID, preference=="yes"]
    )


    const path = await intent.paths(aragonVote.posterAddress)
    if (path == undefined || !path){
      sendAndLogError(res,"no possible path to vote")
      return;
    }
    console.log("paths:",path);
    // return shortest path
    res.status(200).send(JSON.stringify(path));
    // console.log("paths:",paths);
  }
}


async function getMSFromBlockNumber(startBlock:string):Promise<number>{
  const params = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      "jsonrpc":"2.0",
      "method":"eth_getBlockByNumber",
      "id":1,
      "params":["0x"+parseInt(startBlock).toString(16), true]
    })
  };
  const voteStartTime = await fetch("https://rinkeby.infura.io/v3/" + process.env.INFURE_PROJECT_ID,
    params )
    .then(async response =>
    {
      const jsonResponse = await response.json();
      const timestamp = parseInt(jsonResponse.result.timestamp, 16)*1000;
      // console.log("block timestamp:", );
      return timestamp;

    }).catch(err=>{
      console.log("error on infura request:", err);
      return err;
    });

  return voteStartTime;
}

class AragonVote{
  constructor(public timestamp:string, public url:string, public posterAddress:string) {
  }
  public GetJSON(){
    return JSON.stringify(this);
  }

}

