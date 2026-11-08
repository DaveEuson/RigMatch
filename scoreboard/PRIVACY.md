# RigMatch scoreboard: privacy

The scoreboard collects Speed score results that people choose to share. It's anonymous: nothing it keeps says who sent a result or which computer it came from.

## When anything is sent

Only when you press Share on one Speed score result in RigMatch (My PC › Speed score). Nothing is sent automatically, in the background, or for any other result.

## What is sent and kept

- The tier and its model (for example Standard, `qwen3:8b`), the model file's digest and its quantization
- The test version and context size
- The speeds: reading and writing in tokens a second, the load time, and how much of the model sat on the graphics card
- The graphics card's name and memory, and the driver, Ollama and RigMatch versions
- A random id made when you press Share, so a result sent twice is counted once. It's made fresh each time and links to nothing.
- The day it arrived (not the time)

## What is not sent or kept

No name, account, email, host name, user name or file paths. No prompts, answers or chats. No time of day. Your internet address is not stored.

## Your internet address

Your address reaches Cloudflare, which runs the scoreboard, because every request on the internet carries one. The scoreboard doesn't store it, and request logging is off.

To stop one place from flooding the board, it counts results per address per day like this. It mixes the address with a random value made for that day, hashes the mix, and keeps only the hash and a count. The random value, hashes and counts are deleted once the day ends (UTC). After that, nothing is left to connect a result to an address.

## Who can see results

- **Anyone:** the board, which gives each graphics card's result count and median speeds (`/v1/cards`).
- **The maintainer (Dave Euson):** the individual results in the database, so junk can be taken off the board.

Results aren't sold or shared with anyone else.

## Removing a result

Nothing links a result to you, so the scoreboard can't pick out yours later. That is the cost of being anonymous. A result that looks wrong (impossible speeds, a fake card) is taken off the board by hand.

## Where it runs

On Cloudflare Workers, with the results in Cloudflare's D1 database. The code is in this folder, and this file's history on GitHub shows every change to it.
