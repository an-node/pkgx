#!/usr/bin/env -S tea -E

/*---
args:
  - deno
  - run
  - --allow-net
  - --allow-run
  - --allow-read=/opt
  - --allow-write=/opt
  - --allow-env=AWS_ACCESS_KEY_ID,AWS_SECRET_ACCESS_KEY,S3_BUCKET,GITHUB_TOKEN
  - --import-map={{ srcroot }}/import-map.json
---*/

import usePantry from "hooks/usePantry.ts"
import hydrate from "prefab/hydrate.ts"
import build from "prefab/build.ts"
import doInstall from "prefab/install.ts"
import { lvl1 as link } from "prefab/link.ts"
import { semver, PackageRequirement, Package } from "types"
import useCache from "hooks/useCache.ts"
import useCellar from "hooks/useCellar.ts"
import useSourceUnarchiver from "hooks/useSourceUnarchiver.ts"
import { S3 } from "https://deno.land/x/s3@0.5.0/mod.ts";

const pantry = usePantry();
const projects = await pantry.ls()

const s3 = new S3({
  accessKeyID: Deno.env.get("AWS_ACCESS_KEY_ID")!,
  secretKey: Deno.env.get("AWS_SECRET_ACCESS_KEY")!,
  region: "us-east-1",
});

const bucket = s3.getBucket(Deno.env.get("S3_BUCKET")!);

for await (const project of projects) {
  try {
    const req = { project, constraint: new semver.Range('*') }
    await buildIfNeeded({ project: req, install: false })
  } catch (error) {
    console.error({ couldntBuild: project, error })
  }
}

interface BuildOptions {
  project: PackageRequirement
  install: boolean
}

async function buildIfNeeded({ project, install }: BuildOptions) {
  console.verbose({ building: project, install })
  const versions = await pantry.getVersions(project)

  if (project.constraint.raw == "*") {
    const reqs = new Set(versions.map(v => `${v.major}.${v.minor}`))
    for (const req of reqs) {
      const build = { project: project.project, constraint: new semver.Range(req) }
      try {
        await buildIfNeeded({ project: build, install })
      } catch (error) {
        console.verbose({ couldntBuild: { project, req }, error })
      }
    }
    return
  }
  const version = semver.maxSatisfying(versions, project.constraint)
  if (!version) throw "no-version-found"
  const pkg = { project: project.project, version }

  // No need to rebuild anything we've got.
  if (await useCellar().isInstalled(pkg)) {
    console.verbose({ alreadyInstalled: pkg })
    return;
  }
  try {
    if (install) {
      await doInstall(pkg)
    } else if (await bucket.headObject(useCache().s3Key(pkg))) {
      console.verbose({ alreadyUploaded: pkg })
    } else {
      throw "cannot-satisfy-dep"
    }
    return
  } catch {
    console.verbose({ building: project })
  }

  const deps = await pantry.getDeps({ pkg, wbuild: true })
  const graph = await hydrate(deps)

  for (const dep of graph) {
    await buildIfNeeded({ project: dep, install: true })
  }

  await prepare(pkg)
  try {
    const path = await build({ pkg, deps: graph })
    await link({ path, pkg })
  } catch (error) {
    console.verbose({ failedToBuild: pkg, error })
  } finally {
    /// HACK: can't clean up `go` srcdir because it's a required part of the install
    if (pkg.project !== "go.dev") {
      useCellar().mkpath(pkg).join("src").rm({ recursive: true })
    }
  }
}

async function prepare(pkg: Package) {
  const dstdir = useCellar().mkpath(pkg).join("src")
  const { url, stripComponents } = await pantry.getDistributable(pkg)
  const { download } = useCache()
  const zip = await download({ pkg, url, type: 'src' })
  await useSourceUnarchiver().unarchive({
    dstdir,
    zipfile: zip,
    stripComponents
  })
}