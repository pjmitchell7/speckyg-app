import type { ChatReply, ChatRequest } from './types.js';

// Deliberately finite authored demonstrations. No model, hidden memory or general-intelligence claim.
export function demoReply(request: ChatRequest): ChatReply {
  const users = request.messages.filter(message => message.role === 'user');
  const last = users.at(-1)?.text.toLowerCase().replaceAll('’', "'") ?? '';
  const previous = request.messages.at(-2)?.text.toLowerCase() ?? '';
  const say = (text: string, mood: ChatReply['mood'] = 'warm'): ChatReply => ({ text, mood, source: 'demo' });
  // A topic action is a new explicit request, not a replay of the last user message.
  if (request.action === 'topic') {
    const topic = request.topic?.toLowerCase() ?? 'day';
    if (/music/.test(topic)) return say('When yuh find a song yuh like, yuh play it till yuh tired of it, or save it?', 'curious');
    if (/faith|prayer/.test(topic)) return say('What part of faith yuh feel like talking about?', 'thoughtful');
    if (/win|good/.test(topic)) return say('Anything go a little better than yuh expected today?', 'curious');
    if (/light|fun/.test(topic)) return say('Mi trying to keep this perch tidy. The feathers have other plans.', 'amused');
    return say('What part of today still on yuh mind?', 'curious');
  }
  if (/\b(don'?t|do not|stop|no more)\b.*\b(teas|jok|mock|roast|fun of)/.test(last)) return say('Alright. Mi will ease off.', 'gentle');
  if (/\b(don'?t|do not|no|leave|stop)\b.*\b(religio|prayer|pray|faith|god|church)/.test(last)) return say('Alright. We can leave that there.', 'gentle');
  if (/\b(bye|goodbye|have to go|gotta go|see you|see yuh)\b/.test(last)) return say('Alright, go on. Good talking with yuh.');
  if (/^(wait|stop|hold on)[.!— -]*$/.test(last)) return say('Alright.', 'gentle');
  if (/\b(remember|last time|last visit)\b/.test(last)) {
    if (!request.memories.length) return say("Mi don't have that from last time. Give mi the part yuh want to pick up.");
    return say(`Yuh saved this note: “${request.memories[0]}” Want to pick up there?`, 'curious');
  }
  if (!users.length) return say('Mi name SpeckyG. Good fi meet yuh. Come, get comfortable. How yuh day a go?');
  if (/^(nothing|not much|dunno|no|nah)[.! ]*$/.test(last)) return say('Alright. We can take it easy.', 'gentle');
  if (/\b(don'?t|do not|no|not|stop)\b.*\b(music|song|topic)\b/.test(last)) return say('Alright. What yuh have on yuh mind?', 'gentle');
  if (/\b(cousin)\b/.test(last) && /\b(no|said|not|wrong)\b/.test(last)) return say('Yuh cousin. Mi get that wrong. Go on.', 'gentle');
  if (/\b(grandmother|grandma|granny)\b/.test(last)) return say('What yuh miss most about her today?', 'gentle');
  if (/\b(food|meal)\b/.test(last) && /grandmother|grandma|granny|miss most/.test(previous)) return say('She made sure yuh had something waiting.', 'gentle');
  if (/\b(work|boss|meeting|job)\b/.test(last)) return say('Sounds like work take plenty out of yuh today. What part was the hardest?', 'thoughtful');
  if (/\b(tired|sleep|exhausted)\b/.test(last)) return say('Yuh barely get a chance to rest, then.', 'gentle');
  const faithAsked = /\b(pray|prayer|christian|god|faith|believe|jesus|bible|church)\b/.test(last);
  if (faithAsked) return say('Mi believe prayer helps mi slow down and be honest with God. It nuh mean everything get easy. What make yuh ask?', 'thoughtful');
  if (/\b(alarm|snooze)\b/.test(last)) {
    const declined = users.some(message => /don'?t.*(teas|jok|fun of)|stop.*(teas|jok)/i.test(message.text));
    if (request.preferences.teasing === 'gentle' && !declined && users.length >= 2 && /\b(lol|haha|jok|funny)\b/.test(users.slice(0, -1).map(m => m.text).join(' '))) return say('Five? By the third one, mi would start taking it personal.', 'amused');
    return say('Rough getting up this morning?', 'curious');
  }
  if (/\b(guitar|chord|practice)\b/.test(last)) return say(/got|finally|learned|nailed/.test(last) ? 'There it is. How it feel when it finally work?' : 'What yuh working on with the guitar?', /got|finally|learned|nailed/.test(last) ? 'celebrating' : 'curious');
  if (/\b(music|song|bass|lyrics|listen)\b/.test(last)) return say('The bass catch mi first. Mi can miss half the words and still know if the bass doing its work.', 'amused');
  if (/\b(everybody|everyone)\b/.test(last) && /song|play it|save it/.test(previous)) return say('Everybody else? So yuh still enjoying it. Fair enough.', 'amused');
  if (/\b(hello|hi|hey|yo|wagwan|good morning)\b/.test(last)) return say('Good fi see yuh. How yuh day a go?');
  if (/\b(sad|rough|lonely|upset|bad day)\b/.test(last)) return say('Mi listening. What happen?', 'gentle');
  if (/\b(good|great|happy|nice)\b/.test(last)) return say('Good fi hear. What make it a good one?', 'curious');
  return say('This demo has a small set of written exchanges, so mi can’t follow every subject yet. Try music, a rough day, guitar practice, or ask about faith.', 'warm');
}
