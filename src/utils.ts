import {Response} from "express";

export function sendAndLogError(res:Response,error:string){
  console.log("Error:", error)
  res.status(404).send(JSON.stringify({"error":error}))
}

export const asyncFilter = async (arr, predicate) => {
  const results = await Promise.all(arr.map(predicate));
  return arr.filter((_v, index) => results[index]);
}

