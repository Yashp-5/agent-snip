#!/usr/bin/env node

import { parseArgs } from "node:util";
import { optimize, rankSkills, scanSkills, skillCard } from "../src/index.mjs";

function usage() {
  console.error(`Usage:
  agent-snip scan <root> [--pretty]
  agent-snip select <root> --query <text> [--max <n>] [--pretty]
  agent-snip pack <root> --query <text> [--max <n>] [--pretty]`);
}

const [command, root, ...rest] = process.argv.slice(2);
if (!command || !root || !["scan", "select", "pack"].includes(command)) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const { values } = parseArgs({
      args: rest,
      options: {
        query: { type: "string", default: "" },
        max: { type: "string", default: "3" },
        pretty: { type: "boolean", default: false },
      },
      strict: true,
    });
    const maxSkills = Number.parseInt(values.max, 10);
    let output;

    if (command === "scan") {
      output = (await scanSkills(root)).map(skillCard);
    } else if (command === "select") {
      const skills = await scanSkills(root);
      output = rankSkills(skills, values.query).slice(0, maxSkills).map(({ skill, score }) => ({
        score,
        ...skillCard(skill),
      }));
    } else {
      output = await optimize({ root, query: values.query, maxSkills });
    }

    console.log(JSON.stringify(output, null, values.pretty ? 2 : 0));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

