const { Octokit } = require('@octokit/core');
const core = require('@actions/core');

async function run(username, token) {
  const octokit = new Octokit({ auth: token });

  console.log(`[*] Getting ${username}\'s GitHub email`);
  let email = null;

  console.log(`[*] Getting ${username}\'s public profile`);
  const userResult = await octokit.request(`GET /users/${username}`);
  if (userResult?.data?.email) return userResult.data.email;

  const OWNER = process.env.OWNER;
  if (OWNER) {
    if (userResult?.data?.node_id) {
      console.log(`[*] Getting ${username}\'s contributions`);

      const response = await octokit.graphql(
        `query {
          user(login: "${username}") {
            id
            repositoriesContributedTo(first: 100, contributionTypes: COMMIT, includeUserRepositories: true) {
              nodes {
                name
                ref(qualifiedName: "master") {
                  name
                  target {
                    ... on Commit {
                      history(author: {id: "${userResult.data.node_id}"}, first: 1) {
                        nodes {
                          committedDate
                          author {
                            email
                            user {
                              login
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { login: OWNER }
      );
      console.log('API Data:', JSON.stringify(response, null, 2));

      const response2 = await octokit.graphql(
        `query {
          organization(login: "${OWNER}") {
            repositories(first: 100) {
              nodes {
                name
                ref(qualifiedName: "master") {
                  target {
                    ... on Commit {
                      history(first: 1, author: {id: "${userResult.data.node_id}"}, since: "2022-01-01T00:00:00Z") {
                        nodes {
                          committedDate
                          author {
                            name
                            email
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
        { login: OWNER }
      );
      console.log('API Data:', JSON.stringify(response2, null, 2));
    } else {
      console.log(`[!] User was not found so we cannot look into owner repos`);
    }
  }

  console.log(`[*] Getting ${username}\'s activity on public repos`);
  const eventsResult = await octokit.request(`GET /users/${username}/events`);
  const emailFromEvents = eventsResult.data
    .flatMap(event => event.payload.commits || [])
    .map(commit => commit.author.email)
    .find(email => email && !email.includes('users.noreply.github.com'));
  if (emailFromEvents) return emailFromEvents;

  throw Error(`[!!!] Could not find ${username}'s email`);
}

const username = process.env.USERNAME;
const token = process.env.TOKEN;

run(username, token)
  .then(foundEmail => {
    console.log(`[*] Found ${username}\'s email: ${email}`);
    core.setOutput('email', foundEmail);
  })
  .catch(error => {
    console.error(error);
    core.setFailed(error.message);
  });
