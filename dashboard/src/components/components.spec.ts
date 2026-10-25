import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { LeadRow } from '../api';
import KpiCard from './KpiCard.vue';
import LeadsTable from './LeadsTable.vue';
import TokenGate from './TokenGate.vue';

const lead = (over: Partial<LeadRow> = {}): LeadRow => ({
  id: '1',
  email: 'j***@acme.com',
  company: 'Acme',
  source: 'contact-form',
  status: 'EMAILED',
  score: 8,
  receivedAt: new Date().toISOString(),
  scoredAt: null,
  emailSentAt: null,
  ...over,
});

describe('LeadsTable', () => {
  it('affiche une ligne par lead avec son statut en français', () => {
    const wrapper = mount(LeadsTable, {
      props: { leads: [lead(), lead({ id: '2', status: 'RECEIVED', score: null, company: null })] },
    });
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
    expect(wrapper.text()).toContain('E-mail envoyé');
    expect(wrapper.text()).toContain('Reçu');
  });

  it('affiche un tiret pour le score ou l\'entreprise manquants', () => {
    const wrapper = mount(LeadsTable, { props: { leads: [lead({ id: '2', status: 'RECEIVED', score: null, company: null })] } });
    const cells = wrapper.findAll('tbody td').map((c) => c.text());
    expect(cells[1]).toBe('—');
    expect(cells[3]).toBe('—');
  });

  it('explique quoi faire quand il n\'y a encore aucun lead', () => {
    const wrapper = mount(LeadsTable, { props: { leads: [] } });
    expect(wrapper.find('table').exists()).toBe(false);
    expect(wrapper.text()).toContain('Aucun lead');
  });
});

describe('TokenGate', () => {
  it('émet le jeton saisi à la validation', async () => {
    const wrapper = mount(TokenGate, { props: { error: null } });
    await wrapper.find('input').setValue('mon-jeton');
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')?.[0]).toEqual(['mon-jeton']);
  });

  it('n\'émet rien tant que le champ est vide et désactive le bouton', async () => {
    const wrapper = mount(TokenGate, { props: { error: null } });
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    await wrapper.find('form').trigger('submit');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('masque la saisie et annonce l\'erreur', () => {
    const wrapper = mount(TokenGate, { props: { error: 'Jeton refusé par l\'API.' } });
    expect(wrapper.find('input').attributes('type')).toBe('password');
    expect(wrapper.find('[role=alert]').text()).toContain('Jeton refusé');
  });
});

describe('KpiCard', () => {
  it('affiche le libellé, la valeur et l\'indication', () => {
    const wrapper = mount(KpiCard, { props: { label: 'Score moyen', value: '7,5', hint: 'sur 10' } });
    expect(wrapper.text()).toContain('Score moyen');
    expect(wrapper.text()).toContain('7,5');
    expect(wrapper.text()).toContain('sur 10');
  });
});
