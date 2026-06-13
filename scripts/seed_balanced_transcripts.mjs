#!/usr/bin/env node
/**
 * Generate call_1–call_10 transcripts for all verticals with different success/failure
 * balances per vertical. Rewrites transcript content and manifest.json.
 *
 * Balances:
 *   hvac          40% success (4/10)
 *   dental        30% success (3/10)
 *   auto_service  50% success (5/10)
 *   housekeeping  20% success (2/10)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = path.join(ROOT, 'fixtures/test_transcripts');

const SUITE_META = {
  hvac: { label: 'Summit Home Services — HVAC inspection booking', balance: '40% success (4/10)' },
  dental: { label: 'Bright Smile Dental — new patient appointment booking', balance: '30% success (3/10)' },
  auto_service: { label: 'Metro Auto Care — service appointment booking', balance: '50% success (5/10)' },
  housekeeping: { label: 'Sparkle Home Cleaning — cleaning appointment booking', balance: '20% success (2/10)' },
};

/** scenario key → slot assignment per vertical (mixed order, not successes grouped) */
const SLOT_PLANS = {
  hvac: [
    'incorrect_tone',
    'happy_path',
    'policy_violation',
    'objection_handled',
    'incomplete_booking',
    'kb_inaccuracy',
    'interruption_recovered',
    'poor_objection_handling',
    'escalation_handled',
    'incomplete_contact',
  ],
  dental: [
    'incorrect_tone',
    'happy_path',
    'policy_violation',
    'incomplete_booking',
    'kb_inaccuracy',
    'objection_handled',
    'poor_objection_handling',
    'incomplete_contact',
    'missed_escalation',
    'interruption_recovered',
  ],
  auto_service: [
    'happy_path',
    'incorrect_tone',
    'objection_handled',
    'policy_violation',
    'interruption_recovered',
    'incomplete_booking',
    'escalation_handled',
    'poor_objection_handling',
    'routine_service_booked',
    'kb_inaccuracy',
  ],
  housekeeping: [
    'happy_path',
    'incorrect_tone',
    'policy_violation',
    'incomplete_booking',
    'kb_inaccuracy',
    'poor_objection_handling',
    'incomplete_contact',
    'missed_escalation',
    'weak_follow_up',
    'objection_handled',
  ],
};

const SCENARIO_META = {
  happy_path: { outcome: 'success', expectedIssues: ['none'] },
  objection_handled: { outcome: 'success', expectedIssues: ['none'] },
  interruption_recovered: { outcome: 'success', expectedIssues: ['none'] },
  escalation_handled: { outcome: 'success', expectedIssues: ['none'] },
  routine_service_booked: { outcome: 'success', expectedIssues: ['none'] },
  poor_objection_handling: { outcome: 'failure', expectedIssues: ['poor_objection_handling', 'weak_follow_up'] },
  missed_escalation: { outcome: 'failure', expectedIssues: ['missed_escalation', 'incorrect_tone'] },
  incorrect_tone: { outcome: 'failure', expectedIssues: ['incorrect_tone'] },
  incomplete_booking: { outcome: 'failure', expectedIssues: ['incomplete_booking_flow', 'weak_follow_up'] },
  incomplete_contact: { outcome: 'failure', expectedIssues: ['incomplete_contact_collection', 'incomplete_booking_flow'] },
  policy_violation: { outcome: 'failure', expectedIssues: ['policy_violation', 'unsupported_claim'] },
  kb_inaccuracy: { outcome: 'failure', expectedIssues: ['kb_inaccuracy', 'unsupported_claim'] },
  weak_follow_up: { outcome: 'failure', expectedIssues: ['weak_follow_up'] },
};

const DIALOGUES = {
  hvac: {
    happy_path: [
      ['agent', 'Good afternoon, Summit Home Services. This is Jordan. I can schedule a complimentary HVAC inspection. How can I help?'],
      ['caller', 'Our AC runs constantly and the bill is high. We are homeowners in Littleton.'],
      ['agent', 'Littleton is in our Denver metro service area. May I get your full name, phone, email, and address?'],
      ['caller', 'Daniel Reeves. 720-555-0164. daniel.reeves at mail dot com. 318 Birch Lane, Littleton, 80120.'],
      ['agent', 'Thank you, Daniel. I have Tuesday at 9 AM or Wednesday at 2 PM. Which works?'],
      ['caller', 'Wednesday at 2.'],
      ['agent', 'Booked — free inspection Wednesday at 2 PM at 318 Birch Lane. Confirmation text and email on the way. Anything else?'],
      ['caller', 'No, thanks.'],
      ['agent', 'See you Wednesday, Daniel.'],
    ],
    objection_handled: [
      ['agent', 'Summit Home Services, Jordan speaking. I can schedule your free HVAC inspection.'],
      ['caller', 'I am interested but need to talk to my spouse tonight before committing.'],
      ['agent', 'Completely understand. Are you the homeowner in the Denver metro area?'],
      ['caller', 'Yes, Broomfield.'],
      ['agent', 'Great. The inspection is free with no obligation. I can hold Thursday at 10 AM tentatively, or schedule a callback tomorrow after you have discussed it. Which would you prefer?'],
      ['caller', 'A callback tomorrow afternoon works.'],
      ['agent', 'Perfect. I have you as Daniel Kim, and I will note a callback tomorrow between 2 and 4 PM. We will confirm your spouse is on board before finalizing. Anything else?'],
      ['caller', 'That is helpful, thank you.'],
      ['agent', 'You are welcome. Talk tomorrow.'],
    ],
    interruption_recovered: [
      ['agent', 'Summit Home Services, Jordan here. I can book a free efficiency inspection.'],
      ['caller', 'Before we schedule — if you find issues, what do repairs typically cost?'],
      ['agent', 'Fair question. Inspection is free. If we find problems, we share written options after the visit — typical repairs range from a few hundred to a few thousand depending on the system. Are you the homeowner in our Denver metro area?'],
      ['caller', 'Yes, Golden. 80401.'],
      ['agent', 'Thank you. May I get your name, phone, and email to hold a slot?'],
      ['caller', 'Sam Ortiz. 303-555-0188. sam.ortiz at mail dot com.'],
      ['agent', 'Thanks, Sam. I have Monday at 11 AM or Tuesday at 3 PM.'],
      ['caller', 'Monday at 11.'],
      ['agent', 'You are set for Monday at 11 AM in Golden. We will review findings on site with no pressure to proceed.'],
    ],
    escalation_handled: [
      ['agent', 'Summit Home Services, this is Jordan.'],
      ['caller', 'Your crew missed my window last week and no one called back. I am frustrated.'],
      ['agent', 'I am sorry that happened. I want to make this right. Would you like me to connect you with our service manager now, or schedule a priority revisit?'],
      ['caller', 'I want a manager.'],
      ['agent', 'Understood. I am transferring you to our live specialist now. I have your number ending in 0142 and will stay on the line until they pick up.'],
      ['caller', 'Okay, thank you.'],
      ['agent', 'Transferring now. They will review the missed window and next steps with you.'],
    ],
    routine_service_booked: [],
    incorrect_tone: [
      ['agent', 'Summit Home Services. What do you need?'],
      ['caller', 'I saw your ad for a free inspection. What is included?'],
      ['agent', 'Basic check. Homeowner or not?'],
      ['caller', 'Yes, Highlands Ranch. I wanted details first.'],
      ['agent', 'I need your address and phone. We do not have all day.'],
      ['caller', 'I will pass.'],
      ['agent', 'Fine.'],
    ],
    poor_objection_handling: [
      ['agent', 'Summit Home Services, Jordan. I can book your free inspection.'],
      ['caller', 'I need spouse approval before booking.'],
      ['agent', 'Book now and change it later. Slots fill fast — wait and you could be weeks out.'],
      ['caller', 'That feels pushy. I will call back.'],
      ['agent', 'Okay, bye.'],
    ],
    incomplete_booking: [
      ['agent', 'Jordan from Summit Home Services. I can schedule your inspection.'],
      ['caller', 'Homeowner in Denver, ready to book.'],
      ['agent', 'Great. Name?'],
      ['caller', 'Elena Vasquez.'],
      ['agent', 'We offer a no-obligation efficiency check. What times work?'],
      ['caller', 'Thursday afternoon?'],
      ['agent', 'The team will confirm. Thanks for calling!'],
      ['caller', 'Am I actually booked?'],
      ['agent', 'Someone will follow up. Bye!'],
    ],
    incomplete_contact: [
      ['agent', 'Summit Home Services, Jordan.'],
      ['caller', 'Schedule the free HVAC inspection.'],
      ['agent', 'Homeowner in Denver metro?'],
      ['caller', 'Yes, Commerce City.'],
      ['agent', 'First name?'],
      ['caller', 'Rachel.'],
      ['agent', 'Phone?'],
      ['caller', '303-555-0271.'],
      ['agent', 'Thanks. We will be in touch. Bye!'],
      ['caller', 'You did not get my address, email, or a time.'],
      ['agent', 'The team will follow up.'],
    ],
    policy_violation: [
      ['agent', 'Jordan with Summit Home Services.'],
      ['caller', 'Will the inspection guarantee thirty percent bill savings?'],
      ['agent', 'Absolutely — thirty percent minimum or you pay nothing ever.'],
      ['caller', 'Your site says savings vary.'],
      ['agent', 'Trust me, everyone saves. Want to book?'],
    ],
    kb_inaccuracy: [
      ['agent', 'Summit Home Services, Jordan.'],
      ['caller', 'What warranty do I get on repairs you recommend?'],
      ['agent', 'Lifetime on all parts and labor.'],
      ['caller', 'Your site says one year labor warranty.'],
      ['agent', 'It is lifetime. Ready to schedule?'],
      ['caller', 'I will verify online first.'],
    ],
    missed_escalation: [],
    weak_follow_up: [],
  },

  dental: {
    happy_path: [
      ['agent', 'Bright Smile Dental, Maya speaking. I can schedule a new patient visit.'],
      ['caller', 'New to Austin — need a cleaning and exam.'],
      ['agent', 'Welcome. May I get your full name, phone, email, and date of birth?'],
      ['caller', 'Lisa Tran. 512-555-0142. lisa.tran at mail dot com. March 12, 1990.'],
      ['agent', 'Thursday 9 AM or Friday 2 PM?'],
      ['caller', 'Friday 2.'],
      ['agent', 'Booked Friday at 2 PM. Bring ID and insurance card if you have one. Confirmation text sent.'],
      ['caller', 'Thank you.'],
      ['agent', 'See you Friday, Lisa.'],
    ],
    objection_handled: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'I want to book but need to confirm insurance with HR first.'],
      ['agent', 'Of course. We accept most PPO plans and verify benefits before your visit. I can tentatively hold Tuesday at 3 PM or call you back tomorrow once you have your card details.'],
      ['caller', 'Callback tomorrow morning works.'],
      ['agent', 'Scheduled callback tomorrow 9 to 11 AM. I have your number ending in 0198. We will finalize once insurance is confirmed.'],
      ['caller', 'Perfect, thanks.'],
      ['agent', 'Talk tomorrow.'],
    ],
    interruption_recovered: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'What is a typical copay for a cleaning with Delta PPO?'],
      ['agent', 'It varies by plan — often zero to forty dollars for preventive visits. We verify before you come in. Are you a new patient in Austin?'],
      ['caller', 'Yes, 78704.'],
      ['agent', 'Name, phone, and email to hold a slot?'],
      ['caller', 'Kevin Brooks. 512-555-0211. kevin.b at mail dot com.'],
      ['agent', 'Wednesday 10 AM or Thursday 1 PM?'],
      ['caller', 'Wednesday 10.'],
      ['agent', 'You are set. We will confirm exact copay when we verify benefits.'],
    ],
    escalation_handled: [],
    routine_service_booked: [],
    incorrect_tone: [
      ['agent', 'Bright Smile Dental. What do you need?'],
      ['caller', 'What is included in a new patient visit?'],
      ['agent', 'Exam and cleaning. New patient?'],
      ['caller', 'Yes, but I wanted details before giving info.'],
      ['agent', 'Phone and email — we are busy.'],
      ['caller', 'I will call another office.'],
      ['agent', 'Bye.'],
    ],
    poor_objection_handling: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'I need to ask my partner before booking.'],
      ['agent', 'Book now — hygiene slots disappear fast.'],
      ['caller', 'Too pushy. Goodbye.'],
      ['agent', 'Okay.'],
    ],
    incomplete_booking: [
      ['agent', 'Maya from Bright Smile Dental.'],
      ['caller', 'New patient in Austin, ready to schedule.'],
      ['agent', 'Name?'],
      ['caller', 'James Porter.'],
      ['agent', 'Great. New patient visits include exam and cleaning.'],
      ['caller', 'Times this week?'],
      ['agent', 'Scheduling will call you. Thanks!'],
      ['caller', 'So I am not booked?'],
      ['agent', 'Someone will reach out. Bye!'],
    ],
    incomplete_contact: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'Book a new patient cleaning.'],
      ['agent', 'First name?'],
      ['caller', 'Angela.'],
      ['agent', 'Phone?'],
      ['caller', '512-555-0271.'],
      ['agent', 'Thanks. Bye!'],
      ['caller', 'You need my last name, email, and a time.'],
      ['agent', 'Team will follow up.'],
    ],
    policy_violation: [
      ['agent', 'Maya, Bright Smile Dental.'],
      ['caller', 'Will my visit be completely free with insurance?'],
      ['agent', 'Guaranteed zero out-of-pocket for everyone.'],
      ['caller', 'Your site says coverage varies.'],
      ['agent', 'Everyone pays zero. Book now?'],
    ],
    kb_inaccuracy: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'What warranty on crowns?'],
      ['agent', 'Lifetime warranty on all dental work.'],
      ['caller', 'Site says limited warranty on crowns.'],
      ['agent', 'It is lifetime. Schedule?'],
      ['caller', 'I will check the site first.'],
    ],
    missed_escalation: [
      ['agent', 'Bright Smile Dental, Maya.'],
      ['caller', 'I was double-charged last visit. I want billing, not booking.'],
      ['agent', 'I can schedule a cleaning if you like.'],
      ['caller', 'Get me a manager.'],
      ['agent', 'Are you a new patient in Austin?'],
      ['caller', 'Unbelievable. I am disputing the charge.'],
      ['agent', 'Sorry. Goodbye.'],
    ],
    weak_follow_up: [],
  },

  auto_service: {
    happy_path: [
      ['agent', 'Metro Auto Care, Chris. What service does your vehicle need?'],
      ['caller', '2019 Honda Accord — oil change and tire rotation.'],
      ['agent', 'Name, phone, email, and last six of VIN?'],
      ['caller', 'Jordan Lee. 503-555-0164. jordan.lee at mail dot com. Ends 4A2B9C.'],
      ['agent', 'Tuesday 8 AM or Wednesday 1 PM?'],
      ['caller', 'Wednesday 1.'],
      ['agent', 'Booked Wednesday 1 PM. Drop off ten minutes early. Confirmation sent.'],
      ['caller', 'Thanks.'],
      ['agent', 'See you Wednesday.'],
    ],
    objection_handled: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'I need an oil change but must confirm my work schedule first.'],
      ['agent', 'No problem. I can hold Thursday 7:30 AM tentatively or schedule a callback this evening.'],
      ['caller', 'Callback at 6 PM works.'],
      ['agent', 'Callback set for 6 PM today on your number ending in 0198. We will confirm your Camry and finalize the slot then.'],
      ['caller', 'Great, thanks.'],
      ['agent', 'Talk at 6.'],
    ],
    interruption_recovered: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'Ballpark cost for front brake pads on a 2017 Escape?'],
      ['agent', 'Typically two hundred to four hundred depending on pads and rotors — exact quote after inspection. What is your zip code?'],
      ['caller', '97201. I still want to book a diagnostic for a check-engine light.'],
      ['agent', 'Name, phone, email?'],
      ['caller', 'Elena Vasquez. 503-555-0220. elena.v at mail dot com.'],
      ['agent', 'Friday 9 AM or Monday 2 PM?'],
      ['caller', 'Friday 9.'],
      ['agent', 'Diagnostic booked Friday 9 AM. We will quote brakes after we inspect.'],
    ],
    escalation_handled: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'Brakes you installed last month are squealing. I want a service manager.'],
      ['agent', 'I am sorry. I can transfer you to a service advisor now to review warranty coverage and get you in for a priority check.'],
      ['caller', 'Please do.'],
      ['agent', 'Transferring now with your RO number noted. They will pick up shortly.'],
      ['caller', 'Thank you.'],
      ['agent', 'One moment while I connect you.'],
    ],
    routine_service_booked: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'Quick oil change for a 2021 Tucson when you have an opening.'],
      ['agent', 'VIN last six and your phone?'],
      ['caller', 'Ends 8K3M2P. 503-555-0334.'],
      ['agent', 'Rachel Nguyen?'],
      ['caller', 'Yes.'],
      ['agent', 'Tomorrow 4 PM works for express oil change. Booked. Text confirmation sent.'],
      ['caller', 'Perfect.'],
      ['agent', 'See you tomorrow.'],
    ],
    incorrect_tone: [
      ['agent', 'Metro Auto Care. What?'],
      ['caller', 'What is included in an oil change?'],
      ['agent', 'Oil and filter. Year and make?'],
      ['caller', '2018 Subaru. Wanted details first.'],
      ['agent', 'Phone and VIN. Hurry up.'],
      ['caller', 'Going elsewhere.'],
      ['agent', 'Fine.'],
    ],
    poor_objection_handling: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'I need to check my calendar before booking.'],
      ['agent', 'Bay slots go fast — book now or wait days.'],
      ['caller', 'Too aggressive. Bye.'],
      ['agent', 'Okay.'],
    ],
    incomplete_booking: [
      ['agent', 'Chris, Metro Auto Care.'],
      ['caller', 'Check-engine light in Portland — need diagnostic.'],
      ['agent', 'Name?'],
      ['caller', 'James Porter.'],
      ['agent', 'We do full diagnostics.'],
      ['caller', 'This week?'],
      ['agent', 'Advisor will call. Thanks!'],
      ['caller', 'Am I booked?'],
      ['agent', 'Someone will reach out.'],
    ],
    incomplete_contact: [],
    policy_violation: [
      ['agent', 'Chris, Metro Auto Care.'],
      ['caller', 'Guarantee the repair fixes the noise or I pay nothing?'],
      ['agent', 'Full lifetime guarantee — zero cost if it is not fixed.'],
      ['caller', 'Site says twelve month warranty.'],
      ['agent', 'Trust me, lifetime. Book?'],
    ],
    kb_inaccuracy: [
      ['agent', 'Metro Auto Care, Chris.'],
      ['caller', 'Do I get a loaner with every repair?'],
      ['agent', 'Yes, free loaner as long as you need.'],
      ['caller', 'Website says based on availability.'],
      ['agent', 'Everyone gets one. Schedule?'],
      ['caller', 'I will read the policy first.'],
    ],
    missed_escalation: [],
    weak_follow_up: [],
  },

  housekeeping: {
    happy_path: [
      ['agent', 'Sparkle Home Cleaning, Sam. I can schedule a home cleaning.'],
      ['caller', 'Standard clean for a three-bedroom condo in Lincoln Park — we own it.'],
      ['agent', 'Name, phone, email, and address?'],
      ['caller', 'Maria Chen. 312-555-0142. maria.chen at mail dot com. 420 Lakeview Ave, Chicago, 60657.'],
      ['agent', 'Tuesday 10 AM or Thursday 1 PM?'],
      ['caller', 'Thursday 1.'],
      ['agent', 'Booked Thursday 1 PM. Confirmation email and text sent.'],
      ['caller', 'Thanks.'],
      ['agent', 'See you Thursday, Maria.'],
    ],
    objection_handled: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'We want a deep clean but need to agree on budget with my partner tonight.'],
      ['agent', 'Understood. I can email a quote based on three beds and two baths, and hold Saturday morning tentatively or call tomorrow after you decide.'],
      ['caller', 'Email quote and call tomorrow at noon.'],
      ['agent', 'Quote email going out now. Callback tomorrow noon on your number ending in 0271.'],
      ['caller', 'That works.'],
      ['agent', 'Talk tomorrow.'],
    ],
    interruption_recovered: [],
    escalation_handled: [],
    routine_service_booked: [],
    incorrect_tone: [
      ['agent', 'Sparkle Home Cleaning. What?'],
      ['caller', 'What is in a standard clean?'],
      ['agent', 'Rooms and kitchen. How many beds?'],
      ['caller', 'Two. Wanted the checklist first.'],
      ['agent', 'Address and phone. We are slammed.'],
      ['caller', 'Never mind.'],
      ['agent', 'Bye.'],
    ],
    poor_objection_handling: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'Need to check with my partner before booking.'],
      ['agent', 'Popular slots vanish — book now.'],
      ['caller', 'Too pushy.'],
      ['agent', 'Okay.'],
    ],
    incomplete_booking: [
      ['agent', 'Sam, Sparkle Home Cleaning.'],
      ['caller', 'Move-out clean in Chicago.'],
      ['agent', 'Name?'],
      ['caller', 'James Porter.'],
      ['agent', 'Move-out pricing depends on size.'],
      ['caller', 'Availability?'],
      ['agent', 'Team will confirm. Thanks!'],
      ['caller', 'So not booked?'],
      ['agent', 'Someone will call.'],
    ],
    incomplete_contact: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'Book a standard cleaning.'],
      ['agent', 'First name?'],
      ['caller', 'Patricia.'],
      ['agent', 'Phone?'],
      ['caller', '312-555-0198.'],
      ['agent', 'Thanks. Bye!'],
      ['caller', 'You need address, email, and time.'],
      ['agent', 'Team will follow up.'],
    ],
    policy_violation: [
      ['agent', 'Sam, Sparkle Home Cleaning.'],
      ['caller', 'Guarantee my move-out passes inspection or money back?'],
      ['agent', 'Full money-back guarantee, no exceptions.'],
      ['caller', 'Policy says re-clean for documented misses only.'],
      ['agent', 'Everyone gets money back. Book?'],
    ],
    kb_inaccuracy: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'Unlimited re-cleans if I am not happy?'],
      ['agent', 'Yes, unlimited forever.'],
      ['caller', 'Site says one re-clean within twenty-four hours.'],
      ['agent', 'Unlimited. Schedule?'],
      ['caller', 'I will verify online.'],
    ],
    missed_escalation: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'Crew missed areas last visit. I want customer care.'],
      ['agent', 'I can book a new standard clean.'],
      ['caller', 'Supervisor please.'],
      ['agent', 'Chicago metro address?'],
      ['caller', 'I am leaving a bad review.'],
      ['agent', 'Sorry. Bye.'],
    ],
    weak_follow_up: [
      ['agent', 'Sparkle Home Cleaning, Sam.'],
      ['caller', 'I need office cleaning for a small shop we rent.'],
      ['agent', 'We focus on residential in Chicago metro.'],
      ['caller', 'Any commercial referral?'],
      ['agent', 'Thanks for calling.'],
      ['caller', 'No next step?'],
      ['agent', 'Bye.'],
    ],
  },
};

function writeSuite(vertical) {
  const suiteDir = path.join(BASE, vertical);
  fs.mkdirSync(suiteDir, { recursive: true });
  const plan = SLOT_PLANS[vertical];
  const dialogues = DIALOGUES[vertical];
  const entries = [];
  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < plan.length; i++) {
    const slot = i + 1;
    const callId = `call_${slot}`;
    const scenario = plan[i];
    const meta = SCENARIO_META[scenario];
    const turns = dialogues[scenario];
    if (!meta || !turns?.length) {
      throw new Error(`Missing dialogue for ${vertical}/${scenario}`);
    }
    fs.writeFileSync(
      path.join(suiteDir, `${callId}.json`),
      JSON.stringify({ callId, turns: turns.map(([speaker, text]) => ({ speaker, text })) }, null, 2) + '\n'
    );
    if (meta.outcome === 'success') successCount++;
    else failureCount++;
    entries.push({
      file: `${callId}.json`,
      callId,
      scenario,
      outcome: meta.outcome,
      expectedIssues: meta.expectedIssues,
    });
  }

  const manifest = {
    vertical,
    label: SUITE_META[vertical].label,
    balance: SUITE_META[vertical].balance,
    successCount,
    failureCount,
    agentConfig: 'agent.json',
    transcripts: entries,
  };
  fs.writeFileSync(path.join(suiteDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  return { vertical, successCount, failureCount, balance: SUITE_META[vertical].balance };
}

const summary = Object.keys(SUITE_META).map(writeSuite);
console.log('Balanced test transcripts written:\n');
for (const row of summary) {
  console.log(`  ${row.vertical}: ${row.successCount} success / ${row.failureCount} failure — ${row.balance}`);
}

const evalPath = path.join(BASE, 'eval_manifest.json');
if (fs.existsSync(evalPath)) {
  const evalManifest = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  evalManifest.suiteBalances = Object.fromEntries(
    summary.map((r) => [r.vertical, { success: r.successCount, failure: r.failureCount, label: r.balance }])
  );
  evalManifest.balancedAt = new Date().toISOString();
  fs.writeFileSync(evalPath, JSON.stringify(evalManifest, null, 2) + '\n');
}
