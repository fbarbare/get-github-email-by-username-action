const { Octokit } = require('@octokit/core');
const core = require('@actions/core');

async function run(username, { organization, token }) {
  const octokit = new Octokit({ auth: token });

  console.info(`[*] Getting ${username}\'s GitHub email`);
  let email = null;

  console.info(`[*] Getting ${username}\'s public profile`);
  const userResult = await octokit.request(`GET /users/${username}`);
  console.log('User result:', JSON.stringify(userResult, null, 2));
  if (userResult?.data?.email) return userResult.data.email;

  if (organization) {
    if (userResult?.data?.node_id) {
      console.info(`[*] Getting ${username}\'s contributions in the given organization`);

      const organizationCommitsResult = await octokit.graphql(
        `query {
          organization(login: "${organization}") {
            repositories(first: 100, privacy: PRIVATE, orderBy: { field: NAME, direction: ASC }) {
              nodes {
                name
                ref(qualifiedName: "master") {
                  target {
                    ... on Commit {
                      history(first: 1, author: {id: "${userResult.data.node_id}"}) {
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
        { login: organization }
      );
      console.log('Org commits results:', JSON.stringify(organizationCommitsResult, null, 2));
      const email = organizationCommitsResult.organization.repositories.nodes
        .flatMap(repository => repository.ref.target.history.nodes)
        .flatMap(commit => commit.author.email)
        .find(email => email && !email.includes('users.noreply.github.com'));
      if (email) return email;
    } else {
      console.warning(`[!] User was not found so we cannot look into organization repos`);
    }
  }

  console.info(`[*] Getting ${username}\'s activity on public repos`);
  const eventsResult = await octokit.request(`GET /users/${username}/events`);
  console.log('Public events result:', JSON.stringify(eventsResult, null, 2));
  const emailFromEvents = eventsResult.data
    .flatMap(event => event.payload.commits || [])
    .map(commit => commit.author.email)
    .find(email => email && !email.includes('users.noreply.github.com'));
  if (emailFromEvents) return emailFromEvents;

  throw Error(`[!!!] Could not find ${username}'s email`);
}

const username = process.env.USERNAME;
const organization = process.env.ORGANIZATION;
const token = process.env.TOKEN;

run(username, { organization, token })
  .then(foundEmail => {
    console.info(`[*] Found ${username}\'s email: ${email}`);
    core.setOutput('email', foundEmail);
  })
  .catch(error => {
    console.error(error);
    core.setFailed(error.message);
  });
