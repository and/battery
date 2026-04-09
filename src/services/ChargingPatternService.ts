import {getChargingSessions} from '../storage/settings';

const MIN_SESSIONS_FOR_ANALYSIS = 5;

export interface Recommendation {
  key: string;
  message: string;
  detail: string;
}

/**
 * Analyse stored charging sessions and return up to 3 actionable
 * recommendations for better battery longevity.
 */
export async function getRecommendations(): Promise<Recommendation[]> {
  const sessions = await getChargingSessions();
  if (sessions.length < MIN_SESSIONS_FOR_ANALYSIS) {
    return [];
  }

  const recommendations: Recommendation[] = [];

  // 1. Deep discharge: plug in too late
  const avgStartLevel =
    sessions.reduce((sum, s) => sum + s.startLevel, 0) / sessions.length;
  if (avgStartLevel < 15) {
    recommendations.push({
      key: 'deep_discharge',
      message: 'Plug in earlier',
      detail:
        'You typically start charging below 15%. Plugging in at 20–30% reduces stress on the battery and extends its lifespan.',
    });
  }

  // 2. Frequent full charge: consistently charging to 100%
  const avgEndLevel =
    sessions.reduce((sum, s) => sum + s.endLevel, 0) / sessions.length;
  if (avgEndLevel > 90) {
    recommendations.push({
      key: 'full_charge',
      message: 'Stop charging at 80–85%',
      detail:
        'Charging to 100% regularly accelerates battery wear. Stopping at 80–85% can significantly extend battery longevity.',
    });
  }

  // 3. Overnight charging: long sessions starting in the evening
  const overnightCount = sessions.filter(s => {
    const startHour = new Date(s.startTime).getHours();
    const durationHours = (s.endTime - s.startTime) / (1000 * 60 * 60);
    return startHour >= 21 && durationHours > 4;
  }).length;
  if (overnightCount >= 2) {
    recommendations.push({
      key: 'overnight',
      message: 'Avoid overnight charging',
      detail:
        'Leaving your phone plugged in all night keeps it at 100% for hours. Use the overcharge alert or unplug before sleeping.',
    });
  }

  // 4. Frequent short top-ups
  const shortSessions = sessions.filter(s => {
    const durationMin = (s.endTime - s.startTime) / (1000 * 60);
    return durationMin < 20;
  }).length;
  if (shortSessions / sessions.length > 0.5 && recommendations.length < 3) {
    recommendations.push({
      key: 'short_topups',
      message: 'Fewer, longer charges are better',
      detail:
        'More than half your charges last under 20 minutes. Lithium-ion batteries prefer fewer, longer charge cycles over many short top-ups.',
    });
  }

  return recommendations.slice(0, 3);
}

export async function getSessionCount(): Promise<number> {
  const sessions = await getChargingSessions();
  return sessions.length;
}

export {MIN_SESSIONS_FOR_ANALYSIS};
