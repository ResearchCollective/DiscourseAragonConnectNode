import { connect, describeScript } from '@aragon/connect'
// import {Voting} from '@aragon/connect-thegraph-voting'
import {Vote, VotingConnectorTheGraph} from '@1hive/connect-app-dandelion-voting'
import {Response} from "express";
import {asyncFilter, sendAndLogError} from "./utils";

const orgAddress = "0x08f7771f48673df8E3e22a892661BF06D01fc1f5"
const VOTE_DURATION = 24 * 60 * 60 * 1000; // ms
const TOKEN_REQUEST_LABELS=["token-request"]
const VOTE_LABELS=["vote","experiment"]

export default class Aragon {

  static async NewVoteProposal(req:Request, res:Response){
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })

    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"],
      req.body["firstPostContent"])
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

  // TODO: we respond with 3 transactions but they only need to complete 2
  static async NewTokenProposal(req:Request, res:Response){
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })

    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"],
      req.body["firstPostContent"])
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

    const aragonVote = new AragonVote(
      req.body["timestamp"],
      req.body["url"],
      req.body["userAddress"].toLowerCase(),
      req.body["firstPostContent"]);


    // Connect to the Rinkeby test network
    const org = await connect(orgAddress, 'thegraph', { chainId: 4 })
    const apps = await org.apps();
    const { address } = apps.find(app => app.appName.includes("voting"));


    const voting = new VotingConnectorTheGraph(
      'https://api.thegraph.com/subgraphs/name/1hive/aragon-dandelion-voting-rinkeby'
    );
    const votes = await voting.votesForApp(address, 1000,0);

    const isTokenRequest = TOKEN_REQUEST_LABELS.some( (label)=>{
      return aragonVote.firstPostContent.includes(label)
    });

    let votesWithMatchingMetadata = [];
    if (isTokenRequest){
      votesWithMatchingMetadata = await asyncFilter(votes, async (vote)=> {
        const {script} = vote
        // 0x scripts throw errors
        if (script=="0x"){
          return false
        }
        const description = await describeScript(script, apps, org.provider).catch(e=>{
          console.log("error describing script:", e, " with script:", script)
          return false
        })

        // null descriptions throw errors
        if (!description[0]){
          return false
        }
        console.log("token request description:", description)
        return description[0].description.toLowerCase().includes(aragonVote.posterAddress);
      })}
      else{
      votesWithMatchingMetadata = await asyncFilter(votes, async (vote)=>{
        console.log("metadata for vote:", vote.metadata)
        console.log("matches incoming vote json:",vote.metadata.includes(aragonVote.GetJSON()))
        return vote.metadata.includes(aragonVote.GetJSON());
      })
    }

    console.log("matching votes:",votesWithMatchingMetadata);

    const matchingOpenVotes = await asyncFilter(votesWithMatchingMetadata, async (vote)=> {
      const voteStartTime = await getMSFromBlockNumber(vote.startBlock).catch(e=>{
        console.log("infura error:", e);
        sendAndLogError(res,"error on get block time")
        return;
      });
      return Date.now() < (voteStartTime + VOTE_DURATION)  && !vote.executed
    })

    const unvotedOnByUserOpenVotes = await asyncFilter(matchingOpenVotes, async(vote:Vote)=>{
      const casts = await voting.castsForVote(vote.id,1000,0);
      return !casts.some((cast)=>{
        return cast.voter == aragonVote.posterAddress;
      })
    })

    console.log("unvoted on votes by user:", unvotedOnByUserOpenVotes)

    if (unvotedOnByUserOpenVotes.length==0){
      sendAndLogError(res,"vote not found or expired already or user already voted")
      return;
    }

    if (unvotedOnByUserOpenVotes.length>1){
      if (isTokenRequest){
        sendAndLogError(res,"too many matching open votes - only one open token request is allowed at a time")
        return;
      }
      sendAndLogError(res,"too many matching open votes")
      return;
    }

    const latestVoteID = unvotedOnByUserOpenVotes[0].id.split("voteId:")[1];
    const intent = await org.appIntent(
      address,
      'vote',
      [latestVoteID, req.body["vote"]=="yes"]
    )

    const path = await intent.paths(aragonVote.posterAddress)
    if (path == undefined || !path){
      sendAndLogError(res,"no possible path to vote")
      return;
    }
    console.log("paths:",path);
    res.status(200).send(JSON.stringify(path));
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
  const voteStartTime = await fetch("https://rinkeby.infura.io/v3/" + process.env.INFURA_PROJECT_ID,
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
  constructor(public timestamp:string,
              public url:string,
              public posterAddress:string,
              public firstPostContent:string) {
  }
  public GetJSON(){
    return JSON.stringify(this);
  }

}

