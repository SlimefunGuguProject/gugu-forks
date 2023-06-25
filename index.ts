import { Octokit } from '@octokit/rest'

const ORG_NAME = 'SlimefunGuguProject' // 组织名
const REPO_NAME = 'gugu-forks' // 本项目仓库名
const STATUS_ISSUE = 4 // 仓库状态issue编号
const TOKEN = process.env.ACCESS_TOKEN
const PER_PAGE = 50

const octokit = new Octokit({
  auth: TOKEN
})

interface RepoStatus {
  repo: string,
  behind_diff: number
}

/**
 * 获取所有fork仓库的名称列表
 */
async function getRepos(): Promise<string[]> {
  const repos: string[] = []
  let page = 1
  let errTimes = 0
  let nextQuery = true
  while (nextQuery) {
    // 获取所有仓库
    try {
      const { data } = await octokit.rest.repos.listForOrg({
        org: ORG_NAME,
        type: 'forks',
        per_page: PER_PAGE,
        page: page,
      })

      const len = data.length
      if (len < PER_PAGE) {
        nextQuery = false
      }

      data.forEach((repo) => {
        repos.push(repo.name)
      })

      page++
    } catch (err) {
      errTimes++
      if (errTimes >= 3) {
        console.log('错误次数过多, 停止')
        nextQuery = false
      }
    }

  }
  return repos
}


/**
 * 获取仓库落后commit数量
 * @param repo 仓库
 * @returns {Promise<int>} 仓库落后上游多少commit
 */
async function getCommitsBehind(repo: string): Promise<number> {
  try {
    const { data: repoData } = await octokit.rest.repos.get({
      owner: ORG_NAME,
      repo: repo
    })

    if (!repoData.source) {
      console.error(`${repo}不是fork仓库`)
      return 0
    }

    const author = repoData.source.owner.login
    const forkBranch = repoData.default_branch
    const originalBranch = repoData.source.default_branch

    const { data: compareData } = await octokit.rest.repos.compareCommits({
      owner: ORG_NAME,
      repo: repo,
      base: forkBranch,
      head: `${author}:${originalBranch}`
    })
    return compareData.ahead_by
  } catch (err) {
    console.error(err)
    return 0
  }
}

async function main() {
  console.log('获取仓库列表...')

  const repos = await getRepos()
  console.log(`拥有${repos.length}个fork仓库`)
  const results: RepoStatus[] = []
  repos.forEach(async (repo) => {
    const behind_diff = await getCommitsBehind(repo)

    if (behind_diff > 0) {
      results.push({ repo, behind_diff })
    }
    await new Promise(r => setTimeout(r, 1000))
  })

  if (results.length > 0) {
    const date = new Date()
    let issueBody = `# 仓库检测信息\n\n运行时间: ${date}\n${ORG_NAME}组织共有${repos.length}个fork仓库\n其中有${results.length}个仓库落后上游\n\n## 仓库列表\n| 仓库 | 落后commit数 |\n| --- | --- |\n`

    results.forEach((result) => {
      console.log(`${result.repo} 需要合并上游的 ${result.behind_diff} 个commit`)
      issueBody += `| ${result.repo} | ${result.behind_diff} |\n`
    })

    await octokit.rest.issues.update({
      owner: ORG_NAME,
      repo: REPO_NAME,
      issue_number: STATUS_ISSUE,
      body: issueBody
    })
  }
}

main()
