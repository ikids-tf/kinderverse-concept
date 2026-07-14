import { RecordDraftCard } from './RecordDraftCard';
import { PlayStoryCard } from './PlayStoryCard';
import { ClarifyPromptCard } from './ClarifyPromptCard';
import { TopicWeb } from './TopicWeb';
import { MonthlyPlan } from './MonthlyPlan';
import { WeeklyPlan } from './WeeklyPlan';
import { DailyPlan } from './DailyPlan';
import { WeeklyPlanGrid } from './WeeklyPlanGrid';
import { WorksheetCard } from './WorksheetCard';
import { StudioGallery } from './StudioGallery';
import { LetterPreview } from './LetterPreview';
import { AssessmentReport } from './AssessmentReport';
import type { RegistryPayload } from './contracts';
import type { ComponentState } from './state';

/* UI Registry renderer (SKILL §4 / PRD §6.3).
   The ONLY surface that turns an agent payload into UI. Agents never emit HTML —
   they emit { type, props }; this maps the validated type to a static component.
   Adding a result type = registering a component here + a contract entry. */

export function RegistryRenderer({
  payload,
  state = 'ready',
  onClarifyOption,
}: {
  payload: RegistryPayload;
  state?: ComponentState;
  onClarifyOption?: (option: string) => void;
}) {
  switch (payload.type) {
    case 'RecordDraftCard':
      return <RecordDraftCard props={payload.props} state={state} />;
    case 'PlayStoryCard':
      return <PlayStoryCard props={payload.props} state={state} />;
    case 'ClarifyPrompt':
      return <ClarifyPromptCard props={payload.props} onOption={onClarifyOption} />;
    case 'TopicWeb':
      return <TopicWeb props={payload.props} state={state} />;
    case 'MonthlyPlan':
      return <MonthlyPlan props={payload.props} state={state} />;
    case 'WeeklyPlan':
      return <WeeklyPlan props={payload.props} state={state} />;
    case 'DailyPlan':
      return <DailyPlan props={payload.props} state={state} />;
    case 'WeeklyPlanGrid':
      return <WeeklyPlanGrid props={payload.props} state={state} />;
    case 'WorksheetCard':
      return <WorksheetCard props={payload.props} state={state} />;
    case 'StudioGallery':
      return <StudioGallery props={payload.props} state={state} />;
    case 'LetterPreview':
      return <LetterPreview props={payload.props} state={state} />;
    case 'AssessmentReport':
      return <AssessmentReport props={payload.props} state={state} />;
    default:
      return null;
  }
}
