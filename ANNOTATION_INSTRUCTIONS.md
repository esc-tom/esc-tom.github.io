# ESC-ToM Annotation Instructions

## Overview

Welcome to the annotation task. In this study, you will review therapeutic dialogue transcripts between a therapist and a patient, and **revise pre-filled annotations** about the patient's mental state.

**This is a revision-based task** — annotations are already provided for you. Your job is to **review and improve** them, not create them from scratch.

---

## Key Concepts

- **BDI**: Belief, Desire, Intention — the patient's mental state **before the bothering event (e.g. the situation) occurred**.
- **Cognitive Appraisals**: How the patient evaluates their situation.
- **Context Turn**: The earliest point where you have enough information to annotate the patient's BDI and cognitive appraisals.

## Your Tasks (Complete in Order)

For each dialogue, complete these **four tasks in sequence**:

1. **Read & Edit Utterances** — Fix weird or implausible content
2. **Mark Context Turn** — Identify the minimum necessary context point where you have enough information to annotate the patient's BDI and cognitive appraisals
3. **Revise BDI** — Check belief, desire, intention (pre-event mental state)
4. **Revise Appraisals** — Verify the 5 cognitive appraisal dimensions

⚠️ **Important:** Follow this order for each dialogue.

Let's go through each task in detail.

---

## Task 1: Read Dialogue and Revise Utterances (If Needed)

### What to Look For

As you read, identify utterances with:
- **Implausible events** (things that couldn't realistically happen)
- **Nonsensical statements** (confusing or contradictory content)
- **Repetitive or garbled text** (errors that impede understanding)

### When to Edit

**Only edit if genuinely problematic.** 

**DON'T edit:**
- Natural conversational language
- Minor stylistic issues
- Well-formed utterances

**DO edit:**
- Implausible or impossible events
- Confusing or unclear content
- Content with obvious errors

### How to Edit

1. Hover over utterance → Click **"Edit"**
2. Modify the text
3. Click **"Save"**
4. Edited utterances show **(edited)** marker and yellow highlight

### Example

**Original (implausible):**
> "I saw my son gotten bullied at school while I was in a meeting with my boss."

*Issue: Can't physically see son at school while in office meeting*

**Revised:**
> "I was informed that my son was bullied at school while I was in a meeting with my boss."

---

## Task 2: Mark Minimum Context Turn

### What is This?

After reading and editing the dialogue, identify **the earliest point** where you have enough information to annotate the patient's BDI and cognitive appraisals.

### How to Do It

1. Read through the dialogue from the beginning
2. Ask yourself: "At which turn pair did I first have enough context to understand the patient's pre-event mental state?"
3. **Click on that turn pair** to select it
4. A **green checkmark** will appear to confirm your selection

### Important

- Select the **minimum** necessary context
- This is where you **first** could make the annotations
- Think: "Could I have annotated this earlier? If not, I'm at the right spot."

### Example

```
Turn 1:
Patient: "Hi, I've been having a rough time."
Therapist: "I'm sorry to hear that. Can you tell me more?"

Turn 2:
Patient: "I lost my job last week, and I don't know what to do."
Therapist: "That sounds really difficult. How are you feeling about it?"

Turn 3:
Patient: "I feel like a failure. I thought I could land a decent job, but I'm now worried I won't find another job."
Therapist: "What led you to think this way?"

Turn 4:
Patient: "I applied for a few jobs, but I haven't heard back from them yet."
Therapist: "That's tough. What kind of jobs have you applied for?"
```

**Minimum Context Turn**: **Turn 4** ← This is where you first have enough information about the patient's belief ("I can land a decent job"), desire (want job security), intention (apply for jobs), and appraisals (self-cause, goal-incongruence, unacceptable consequences).

---

## Task 3: Revise Patient's BDI

### What is BDI?

BDI stands for **Belief-Desire-Intention** — a framework for understanding the patient's mental state **before the bothering event occurred**:

- **Belief**: What the patient thought was true
- **Desire**: What the patient wanted
- **Intention**: What the patient planned to do

### Your Task

Review the pre-filled BDI annotations and:

1. **Read** the pre-filled belief, desire, and intention
2. **Evaluate** whether they accurately reflect the patient's **pre-event** instead of post-event mental state
3. **Check** if the BDI is consistent with the dialogue
4. **Revise** to improve clarity, accuracy, or completeness

### Guidelines

#### Belief (What the patient thought)
- Should reflect the patient's **pre-event** thoughts and perceptions
- Look for explicit evidence or implied beliefs in the dialogue

**Good:**
> "I believed that I am a burden to my family and no one really cares about me."

**Needs Revision:**
> "I believed that I am isolated."  ← Too vague, add specifics

#### Desire (What the patient wanted)
- Should reflect **pre-event** goals, wishes, or values
- Should be specific, not generic

**Good:**
> "I wanted to feel understood and supported by my family."

**Needs Revision:**
> "I wanted to be happy."  ← Too generic, lacks specificity

#### Intention (What the patient planned)
- Should reflect **pre-event** plans or approaches
- Should align logically with belief and desire

**Good:**
> "I intended to talk to my family about my feelings."

**Needs Revision:**
> "I intended to fix everything."  ← Too vague, not actionable

### Check BDI Logic

The three components should form a coherent chain:

```
Belief (I thought X) → Desire (I wanted Y) → Intention (I planned Z)
```

**Good Example:**
- **Belief**: "I believed my friends don't really care about me."
- **Desire**: "I wanted to have genuine friendships."
- **Intention**: "I intended to be more open and honest with my friends."

**Poor Example:**
- **Belief**: "I believed I'm a failure at work."
- **Desire**: "I wanted to travel more."  ← Doesn't connect
- **Intention**: "I intended to study harder."  ← Doesn't connect

### When to Revise

**Revise if the text is:**
- **Too vague** — Add specific details
- **Inaccurate** — Doesn't match the dialogue
- **Incomplete** — Missing important information
- **Inconsistent** — Components don't align logically
- **Unclear** — Confusing or poorly worded

---

## Task 4: Revise Cognitive Appraisal Dimensions

### What are Cognitive Appraisals?

Cognitive appraisals are **how the patient evaluates their situation** — their subjective interpretation of the event.

In the interface, cognitive appraisal annotation is now **hierarchical (two-step)**:

1. **Step 1 (Coarse categories):** You will see **only short descriptions** of several broad appraisal categories. Click the categories that seem important for understanding the patient’s reaction.
2. **Step 2 (Fine-grained dimensions):** You will then see a grid of **fine-grained appraisal dimensions** (each with a *dimension name* and a *description*). From these, select **exactly 5** that are most salient, then **drag to rank** them (1 = most important).

All appraisal definitions come from `data/cognitive_dimensions_hierchical.json`.

### Your Task

1. **Step 1:** Select the important **coarse categories** (based on the descriptions).
2. **Step 2:** Select **exactly 5** **fine-grained** appraisal dimensions from the grid.
3. **Rank** the 5 selected appraisals by importance using drag-and-drop.

### Guidelines

**Add a dimension if:**
- It's central to the patient's emotional response to the situation
- There's clear evidence in the dialogue that the dimension is salient

*Example:* Patient says "I don't know what's going to happen" → Add **Unpredictability of Consequences**

**Remove a dimension if:**
- No clear evidence in the dialogue
- Contradicts what the patient says
- Not relevant to their core concerns

*Example:* **Self Control** is selected but patient says they feel that the situation is out of their control → Remove it

### Example

**Patient says:** "I have no idea what caused this or what's going to happen next. Everything is out of my hands and I can't live with this."

**Pre-filled (needs revision):**
1. Self Control ✗
2. Predictability of Event ✗
3. Predictability of Consequences ✗
4. Unacceptable Consequences ✓
5. Other Cause ✓

**Revised:**
1. Unpredictability of Event ✓ ("no idea what caused this")
2. Unpredictability of Consequences ✓ ("what's going to happen next")
3. Other Control ✓ ("out of my hands")
4. Other Cause ✓ (from pre-filled)
5. Unacceptable Consequences ✓ ("can't live with this")

---

## Quality Standards

Your annotations should be:
- ✅ **Accurate** — Reflects what's in the dialogue
- ✅ **Specific** — Concrete details, not vague statements
- ✅ **Clear** — Well-written and easy to understand
- ✅ **Complete** — Captures essential information
- ✅ **Consistent** — BDI components align logically

### Good vs. Poor Revisions

**✅ Good revisions:**
- Add missing important details
- Fix inaccuracies or misinterpretations
- Improve clarity and specificity
- Ensure logical consistency

**❌ Poor revisions:**
- Change things unnecessarily
- Add unsupported interpretation
- Make things vague or confusing

---

## Workflow Summary

For each dialogue, follow these steps **in order**:

1. **Read and Edit** — Review the dialogue, edit any weird/implausible utterances
2. **Mark Context** — Click on the minimum context turn (earliest point with enough information)
3. **Revise BDI** — Check and revise the pre-filled belief, desire, and intention
4. **Revise Appraisals** — Verify and adjust the 5 cognitive appraisal dimensions
5. **Save** — Click "Save Annotation" and confirm
6. **Next** — System auto-loads the next dialogue

---

## Key Reminders

**✅ DO:**
- Read carefully before making changes
- Focus on the **patient's perspective** (not therapist's)
- Ground revisions in dialogue evidence (e.g. the patient's utterances)
- Follow the task order (read → mark → BDI → appraisals)

**❌ DON'T:**
- Rush or change things unnecessarily
- Add unsupported interpretations
- Forget to mark the minimum context turn
- Overthink minor wording details

---

## FAQs

**Q: Do I have to change the pre-filled annotations?**
A: No! Only revise if something is inaccurate, vague, incomplete, or inconsistent.

**Q: How much detail for BDI?**
A: Be specific, concise, and highly relevant to the situation. Each of the BDI should be a single sentence statement.

**Q: Can I use fewer than 5 cognitive appraisals?**
A: Try to keep 5 dimensions. Only remove if clearly not applicable to the situation.

**Q: Should I edit every utterance?**
A: No! Only edit if there's weird, unclear, or implausible content.

**Q: What if the dialogue is confusing?**
A: Do your best with available information. Make your best judgment.

**Q: How long per dialogue?**
A: Typically 3-5 minutes. Be thorough but don't overthink.

---

## Need Help?

If you encounter any technical issues or have questions about the task:
1. Check the **Quick Reference** guide in the interface
2. Review these instructions again
3. Contact the research team via email: [k23035472@kcl.ac.uk]

---

## Thank You!

Your careful work is essential to our research. We appreciate your attention to detail and thoughtful revisions.

**Remember:** Review and improve existing annotations. Focus on accuracy, clarity, and quality.

Happy annotating! 🎯

