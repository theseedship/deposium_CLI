import inquirer from 'inquirer';
import {
  chatSourceChoices,
  printChatSources,
  printChatSourceDetail,
  printChatVerification,
  type ChatTurnDetails,
} from './chat-output';

async function readCitation(
  argument: string,
  citations: NonNullable<ChatTurnDetails['citations']>
): Promise<void> {
  let reference = argument;
  if (!reference) {
    const choices = chatSourceChoices(citations);
    if (!choices.length) {
      console.log('No inspectable citation received for this answer.');
      return;
    }
    const answer = await inquirer.prompt<{ citation: string }>([
      { type: 'select', name: 'citation', message: 'Read which citation?', choices },
    ]);
    reference = answer.citation;
  }
  if (!/^[1-9]\d*$/.test(reference) || !Number.isSafeInteger(Number(reference)))
    console.log('Use /source <citation number>.');
  else printChatSourceDetail(citations, Number(reference));
}

/** Inspect the last emitted answer locally, without fetching documents or invoking a model. */
export async function executeReferenceCommand(
  command: string,
  argument: string,
  details?: ChatTurnDetails
): Promise<void> {
  switch (command) {
    case 'sources':
      if (details?.citations.length) printChatSources(details.citations);
      else console.log('No sources received for the current answer.');
      break;
    case 'source':
      await readCitation(argument, details?.citations ?? []);
      break;
    case 'verify':
      if (details?.verifications.length) printChatVerification(details.verifications, true);
      else console.log('No verification details received for the current answer.');
      break;
  }
}
