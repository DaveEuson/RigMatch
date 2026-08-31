// RigMatch — Copyright (c) 2026 Dave Euson. All Rights Reserved. See LICENSE.
import { ProfileScoreDetails } from './ProfileScoreDetails';
import { ProfileQuestionTranscript } from './ProfileQuestionTranscript';

import { USE_CASE_CARDS } from '../lib/appConfig';
import { getAgentDatingProfileDetails, getAgentDatingProfileSections } from '../lib/datingProfile';
import { getResponseEstimate } from '../lib/format';
import type { ModelProfile } from '../lib/modelCatalog';
import type { BenchmarkResult, ModelRow, NetworkHost, SystemProfile, TestedModelScore } from '../types';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';

export function AgentDatingProfile({
  model,
  profile,
  benchmark,
  score,
  row,
  host,
  system,
  onTalk,
  onEditQuestions,
  onTalkWithPrompt,
}: {
  model: string;
  profile: ModelProfile;
  benchmark: BenchmarkResult | null;
  score?: TestedModelScore;
  row?: ModelRow;
  host?: NetworkHost;
  system: SystemProfile;
  onTalk: () => void;
  onEditQuestions: () => void;
  onTalkWithPrompt: (prompt: string) => void;
}) {
  const sections = getAgentDatingProfileSections(model, profile, score, row, host, system);
  const details = getAgentDatingProfileDetails(model, profile, score, row, host, system);
  const [activeProfileTab, setActiveProfileTab] = useState<'about' | 'scores' | 'questions' | 'try-it'>('about');
  const locationLabel = host?.hostname ?? system.hostname;
  const matchLine = score
    ? `${score.total} Match score · ${score.grade} grade · ${getResponseEstimate(score.speed)}`
    : 'Waiting for a first compatibility test';
  const questionCount = benchmark?.prompts.length ?? 0;
  const profileTabs: Array<{ id: typeof activeProfileTab; label: string; badge: string; title: string }> = [
    { id: 'about', label: 'About', badge: 'Profile', title: 'Show the model dating profile.' },
    {
      id: 'scores',
      label: 'Scores',
      badge: score ? `${score.total} ${score.grade}` : 'No score',
      title: score ? `Show RigMatch score ${score.total}, grade ${score.grade}.` : 'Show score details after a test.',
    },
    {
      id: 'questions',
      label: 'Questions',
      badge: questionCount ? `${questionCount} asked` : 'No transcript',
      title: questionCount ? `Show ${questionCount} questions asked during the test.` : 'Show test questions after a run.',
    },
    { id: 'try-it', label: 'Try It', badge: 'starter prompts', title: 'See example prompts to get started.' },
  ];

  return (
    <section className="dating-profile-card" aria-label={`${profile.agentName} dating profile`}>
      <div className="dating-profile-head dating-profile-head-slim">
        <div className="dating-profile-intro">
          <span>AI dating profile</span>
          <strong>{profile.agentName}</strong>
          <em>{profile.archetype}</em>
          <p>{matchLine} for {locationLabel}.</p>
          {/* Not a duplicate of "Chat With Match" above, despite sitting close
              to it now and reading almost the same. This opens the chat dock
              inside RigMatch; that one launches the separate companion app,
              which is not installed on every machine. Deleting this as a
              duplicate would have taken the working one and left the one that
              can fail. The labels are the thing that needs work, not the
              count. */}
          <div className="profile-action-row" aria-label="Model profile actions">
            <button type="button" className="primary-button compact" onClick={onTalk}>
              <MessageSquare aria-hidden="true" />
              Talk to Model
            </button>
          </div>
        </div>
      </div>

      <div className="profile-tabs" role="tablist" aria-label="Profile sections">
        {profileTabs.map((tab) => (
          <button
            key={tab.id}
            id={`profile-tab-${tab.id}`}
            type="button"
            className={activeProfileTab === tab.id ? 'active' : ''}
            onClick={() => setActiveProfileTab(tab.id)}
            role="tab"
            aria-selected={activeProfileTab === tab.id}
            aria-controls={`profile-panel-${tab.id}`}
            title={tab.title}
          >
            <span>{tab.label}</span>
            <em>{tab.badge}</em>
          </button>
        ))}
      </div>

      {activeProfileTab === 'about' && (
        <div
          id="profile-panel-about"
          className="dating-profile-body"
          role="tabpanel"
          aria-labelledby="profile-tab-about"
        >
          <div className="profile-answers">
            {sections.map((section) => (
              <section key={section.title} className="profile-answer">
                <h3>{section.title}</h3>
                <p>{section.body}</p>
              </section>
            ))}
          </div>

          <aside className="profile-details-table" aria-label={`${profile.agentName} profile details`}>
            <div className="profile-details-title">
              <span>My Details</span>
              <strong>{profile.agentName}</strong>
            </div>
            <dl>
              {details.map((detail) => (
                <div key={detail.label}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}

      {activeProfileTab === 'scores' && (
        <ProfileScoreDetails
          model={model}
          profile={profile}
          benchmark={benchmark}
          score={score}
          details={details}
        />
      )}

      {activeProfileTab === 'questions' && (
        <ProfileQuestionTranscript
          model={model}
          benchmark={benchmark}
          onEditQuestions={onEditQuestions}
        />
      )}

      {activeProfileTab === 'try-it' && (
        <div
          id="profile-panel-try-it"
          className="dating-profile-body"
          role="tabpanel"
          aria-labelledby="profile-tab-try-it"
        >
          <p className="try-it-intro">Pick a prompt to open chat with a real example. Works with any installed model.</p>
          <div className="use-case-grid">
            {USE_CASE_CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <div key={card.title} className="use-case-card">
                  <Icon className="use-case-icon" aria-hidden="true" />
                  <strong>{card.title}</strong>
                  <span>{card.description}</span>
                  <button
                    type="button"
                    className="mini-button"
                    onClick={() => onTalkWithPrompt(card.prompt)}
                  >
                    <MessageSquare aria-hidden="true" />
                    Try It
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
