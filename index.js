const { Octokit } = require('@octokit/core');
const core = require('@actions/core');

async function run() {
  try {
    //inputs defined in action metadata file
    const username = process.env.USERNAME;

    const token = process.env.TOKEN;
    const octokit = new Octokit({ auth: `${token}` });

    console.log(`[*] Getting ${username}\'s GitHub email`);

    //attempt to use auth token to get email via accessing the user's API page
    let userAPIData = null;
    try {
      userAPIData = await octokit.request(`GET /users/${username}`, {});
    } catch (error) {
      console.log('[!] ' + error.message);
    }

    // Extract the email if the user's API was accessed successfully
    let emailUserpage = null;
    if (
      userAPIData != null &&
      userAPIData.data != null &&
      userAPIData.data.email != null &&
      userAPIData.data.email != ''
    ) {
      emailUserpage = userAPIData.data.email;
    }

    const OWNER = process.env.OWNER;
    if (!emailUserpage && OWNER) {
      console.log(`[*] Falling back to old owner retrieval method`);

      const response = await octokit.graphql(
        `query {
          user(login: "fbarbare") {
            id
            repositoriesContributedTo(first: 100, contributionTypes: COMMIT, includeUserRepositories: true) {
              nodes {
                name
                ref(qualifiedName: "master") {
                  name
                  target {
                    ... on Commit {
                      history(author: {id: "MDQ6VXNlcjUwNTUyNDg="}, first: 1) {
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
        { login: 'octokit' }
      );
      console.log('API Data:', JSON.stringify(response, null, 2));
    }

    //email not found on user's API page or failed to authenticate with token, fallback to old method to attempt email retrieval
    if (emailUserpage == null) {
      console.log(`[*] Falling back to old API retrieval method`);

      //fetch user's public events page
      octokit
        .request(`GET /users/${username}/events`)
        .then(({ data: events }) => {
          const emailEventsPage = events
            .flatMap(event => event.payload.commits || [])
            .map(commit => commit.author.email)
            .find(email => email && !email.includes('users.noreply.github.com'));

          if (emailEventsPage == null) {
            throw Error('[!!!] Could not find email in API Data');
          }

          console.log(`[*] Found ${username}\'s email: ${emailEventsPage}`);
          core.setOutput('email', emailEventsPage);
        })
        .catch(error => {
          core.setFailed(error.message);
        });
    } else {
      console.log(`[*] Found ${username}\'s email: ${emailUserpage}`);
      core.setOutput('email', emailUserpage);
    }
  } catch (error) {
    core.setFailed(error.message);
    throw error;
  }
}

run().catch(console.error);
