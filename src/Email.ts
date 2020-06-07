const nodefetch = require("node-fetch");
const FormData = require('form-data');

export default class Email{

  static async SendEmail(toEmail:string, vc:string): Promise<string>{
    const myHeaders = {"Authorization": "Basic YXBpOmU5NTUzNzc4MTU3YWVkOGMxMThjZWJjNWEzMTVkZDAzLTU2NDViMWY5LTRkNTdiNTNi"};

    const emailMessage = "Here is your verified credential: " + vc;
    const formdata = new FormData();
    formdata.append("from", "noreply@researchcollective.io");
    formdata.append("to", toEmail);
    formdata.append("subject", "The Research Collective Approved Your Posting!");
    formdata.append("text", emailMessage);

    const requestOptions = {
      method: 'POST',
      headers: myHeaders,
      body: formdata,
      redirect: 'follow'
    };

    return nodefetch("https://api.mailgun.net/v3/mg.researchcollective.io/messages", requestOptions)
      .then(response => response.text())
      .then(result => {
        return result;
      })
      .catch(error => {
        console.log('error', error);
      return error
      });
  }

}
