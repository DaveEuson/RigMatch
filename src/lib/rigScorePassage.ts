// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
/**
 * The text RigScore's prompt-processing half is timed on.
 *
 * Every computer reads this same passage, so the prompt speed is measured on
 * the same work. It was written for RigMatch (a made-up town, so no one's
 * copyright and no facts to go stale) and is plain ASCII, so every tokenizer
 * splits it the same way each time. With the instruction it lands near
 * RIG_WORKLOAD.promptTokensTarget (1,500) on the tier models' tokenizers:
 * measured on 2026-10-24 at 1,486 tokens on llama3.2:3b and 1,495 on
 * qwen3:0.6b (the tokenizer the three qwen3 tiers share), counting the chat
 * template. Changing a word of it changes the work, so RIG_WORKLOAD.version
 * moves with it.
 */

export const RIG_PASSAGE = `The town of Wrenmouth sits at the mouth of a slow river, where the water spreads into a wide estuary before it meets the sea. For most of its history the town lived on fishing, rope making and the repair of small boats, and like many harbour towns it organised its days around the tide rather than the clock. Boats left two hours before high water and came back on the ebb. Shops opened when the first catch was landed. Children learned to read the height of the water against the stone steps of the quay long before they could read the hands of a watch.

That changed in the spring of 1871, when the harbour board voted to build a public clock above the customs house. The decision was not a sentimental one. The railway had reached the next valley, and the timetable of the trains, which ran on the time kept in the capital, did not care about the tide. Merchants who sent fish inland found that a cart leaving at what the fishermen called "first water" might arrive at the station ten minutes after the train had gone. A clock that everyone could see, set to the same time as the railway, seemed like the cheapest way to stop losing money.

The board asked three makers for prices. The first proposed a large mechanical movement with a pendulum nearly four metres long, housed in a wooden case inside the customs house roof. The second offered a smaller movement with a gravity escapement, which would keep better time in wind and damp but cost almost twice as much. The third suggested that the town buy a cheap movement and pay a local man to correct it every morning against the time signal sent by telegraph to the railway station. After a long meeting, and a vote that was decided by a single member, the board chose the second design. The minutes record that one member said a clock which needed a man to correct it every morning was not a clock but a pension.

Building the tower took longer than anyone expected. The customs house had been built on timber piles driven into soft mud, and the engineer sent to inspect it found that the north wall had already settled by several centimetres. Adding a heavy clock and four large dials would make it worse. The solution was a light iron frame that carried the weight of the dials down to new foundations beside the old building, so that the clock tower stood next to the customs house rather than on top of it, joined to it only by a narrow bridge at the level of the second floor. Many visitors still assume the tower is part of the original building. It is not, and the gap between the two can be seen from the quay at low tide, when the light falls between them.

The clock was started on the first day of October 1873. For the first winter it kept excellent time, losing less than two seconds a week. In the second winter it began to stop. The keeper, a former ship's carpenter named Elias Brand, found that salt carried on the wind was settling on the oil of the pivots and turning it into a thick paste. He tried heavier oil, then lighter oil, then no oil at all on some of the wheels, and kept a notebook of every change and its effect. The notebook survives in the town library. It shows that he wound the clock every eight days for thirty one years, and that in all that time it stopped on its own only nineteen times, almost always in the week after a storm.

Brand also kept a second record that turned out to be more valuable than the first. Every day at noon he wrote down the height of the water at the quay steps, measured against marks he had cut into the stone. He did this because the board had asked whether the clock could also show the tide, and he wanted to know how regular the tide really was. After ten years he had more than three thousand readings. A visiting surveyor used them to draw the first accurate tide tables for the estuary, which showed that the high water at Wrenmouth arrived on average forty minutes later than the tables printed for the open coast had claimed. Fishermen had known this for generations, but it had never been written down, and boats from other harbours had run aground on the bar because of it.

In 1908 the board added a fifth hand to the clock, painted blue, that turned once in a little under twenty five hours and pointed to the state of the tide. It was driven by a separate train of wheels with a gear ratio worked out from Brand's readings. The tide hand was never perfectly accurate, because the tide depends on the wind and the pressure of the air as well as the moon, but it was usually right within a quarter of an hour, and for the fishermen that was close enough. Older people in the town still say that something is "on the blue hand" when they mean it will happen when the time is right rather than at a fixed hour.

During the war years the clock was stopped twice on the orders of the harbour master, once because the lit dials could be seen from the sea at night and once because the bell was needed for a warning signal. Each time Brand's successor, his niece Martha Brand, kept the tide record going by hand, walking down to the quay steps at noon with a lantern in winter and a measuring staff she had marked herself. Her readings fill two thin volumes bound in sailcloth. When they were compared with the readings taken before and after the war, they matched to within a few centimetres, which surprised the surveyors who had expected a gap. The council later named the path from the customs house to the steps after her, and a small brass plate at the top of the steps still shows the mark she used for the highest tide she ever recorded.

The clock was converted to electric winding in 1962, and the original movement was taken out and replaced with a modern one in 1987. For a few years the tower was silent and the blue hand did not move, because no one could work out how to drive it from the new movement. A group of volunteers, most of them retired engineers and teachers, rebuilt the tide train in their spare time using Brand's notes and the drawings of the 1908 work. They finished in 1994 and have looked after the clock ever since. They wind nothing now, but they still visit every week, oil the tide wheels by hand, and write the height of the water at noon in a notebook that sits on the same shelf as the one Elias Brand started more than a century ago.

Today the clock is one of the reasons visitors come to Wrenmouth. Guides explain the gravity escapement, the iron frame and the gap between the tower and the customs house. What they usually find hardest to explain is the blue hand. Most people expect a clock to tell them what time it is. The clock above the harbour also tells them what the water is doing, and for a town that lived by the tide for most of its history, that has always been the more useful thing to know.`;

/** Asks for more than the generation cap, so every run writes the same 256 tokens. */
export const RIG_INSTRUCTION = 'Summarise the passage above in detail, one paragraph for each part of the story, keeping every name, date and number.';

/**
 * The prompt for one run, counted from 1 (the warm-up is run 1).
 *
 * Each run opens with its own number. Ollama keeps the last prompt's work and
 * skips any opening it has seen before, so a second identical prompt would
 * time almost no reading at all. A different first line makes it read the
 * whole passage every time.
 */
export function rigPrompt(run: number): string {
  return `Reading ${run}.\n\n${RIG_PASSAGE}\n\n${RIG_INSTRUCTION}`;
}
