require('dotenv/config');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const { Configuration, OpenAIApi } = require('openai');

// https://firebase.google.com/docs/functions/get-started

const dbRef = admin.firestore().doc('tokens/demo');

const TwitterApi = require('twitter-api-v2').default;
const twitterClient = new TwitterApi({
  clientId: process.env.TWITTER_CLIENT_ID,
  clientSecret: process.env.TWITTER_SECRET,
});

const callbackURL = 'http://127.0.0.1:5000/gpt3-tweeter/us-central1/callback';

const configuration = new Configuration({
  organization: process.env.OPENAI_ORG,
  apiKey: process.env.OPENAI_KEY,
});

const openai = new OpenAIApi(configuration);

const OPENAI_PROMPTS = [
  'something useful related to programming',
  'javascript programming',
  'python programming',
  'web development for beginners',
  'advance web development',
  'programming syntax',
  'SaaS development',
  'being a SaaS entrepreneur',
  'starting out with programming',
  'javascript resources',
  'best coding practices',
  'the mindset of a programmer',
  'the habits to be a good programmer',
  'AI related programming',
  'machine learning related programming',
  'stable diffusion related programming',
  'generative AI',
  'javascript frameworks',
  'programming and make it interactive',
  'SaaS ideas',
  'the benefits of being a programmer',
  'javascript programming with code example',
  'python programming with code example',
  'something informative related to typescript',
  'ReactJS',
  'Kubernetes',
  'something rhetorical related to programming',
];

exports.auth = functions.https.onRequest(async (request, response) => {
  const { url, codeVerifier, state } = twitterClient.generateOAuth2AuthLink(
    callbackURL,
    {
      scope: ['tweet.read', 'tweet.write', 'users.read', 'offline.access'],
    }
  );

  // store verifier
  await dbRef.set({ codeVerifier, state });

  response.redirect(url);
});
//   functions.logger.info("Hello logs!", {structuredData: true});

exports.callback = functions.https.onRequest(async (request, response) => {
  const { state, code } = request.query;

  const dbSnapshot = await dbRef.get();
  const { codeVerifier, state: storedState } = dbSnapshot.data();

  if (state !== storedState) {
    return response.status(400).send('Stored tokens do not match!');
  }

  const {
    client: loggedClient,
    accessToken,
    refreshToken,
  } = await twitterClient.loginWithOAuth2({
    code,
    codeVerifier,
    redirectUri: callbackURL,
  });

  await dbRef.set({ accessToken, refreshToken });
  const { data } = await loggedClient.v2.me(); // start using the client if you want
  //   response.sendStatus(200);
  response.send(data);
});

exports.tweet = functions.https.onRequest(async (request, response) => {
  //   const { refreshToken } = (await dbRef.get()).data();
  const snap = await dbRef.get();
  const { refreshToken } = snap.data();

  const {
    client: refreshedClient,
    accessToken,
    refreshToken: newRefreshToken,
  } = await twitterClient.refreshOAuth2Token(refreshToken);

  await dbRef.set({ accessToken, refreshToken: newRefreshToken });

  //   const { data } = await refreshedClient.v2.me();

  const nextTweet = await openai.createCompletion({
    model: 'text-davinci-003',
    // prompt: 'tweet something useful related to programming',
    prompt: `Wrte a tweet about ${
      OPENAI_PROMPTS[Math.floor(Math.random() * OPENAI_PROMPTS.length)]
    }`,
    max_tokens: 128,
  });

  const textTweet = nextTweet.data.choices && nextTweet.data.choices[0].text;

  const { data } = await refreshedClient.v2.tweet(
    // nextTweet.data.choices[0].text
    textTweet
  );

  response.send(data);
});

exports.tweetHourly = functions.pubsub
  .schedule('48 * * * *')
  .onRun(async (context) => {
    const snap = await dbRef.get();
    const { refreshToken } = snap.data();

    const {
      client: refreshedClient,
      accessToken,
      refreshToken: newRefreshToken,
    } = await twitterClient.refreshOAuth2Token(refreshToken);

    await dbRef.set({ accessToken, refreshToken: newRefreshToken });

    const nextTweet = await openai.createCompletion({
      model: 'text-davinci-003',
      prompt: `Generate a tweet about ${
        OPENAI_PROMPTS[Math.floor(Math.random() * OPENAI_PROMPTS.length)]
      } ${Math.random() < 0.3 ? 'with' : 'without'} hashtags ${
        Math.random() < 0.3 && 'and with emoji'
      }`,

      max_tokens: 128,
    });

    const textTweet = nextTweet.data.choices && nextTweet.data.choices[0].text;

    const { data } = await refreshedClient.v2.tweet(textTweet);

    return;
  });
