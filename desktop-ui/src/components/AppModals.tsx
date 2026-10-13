import { SettingsModal } from './settings/SettingsModal';
import { NewProjectModal } from './modals/NewProjectModal';
import { ConnectCredentialModal } from './modals/ConnectCredentialModal';
import { TerminalPermissionModal } from './modals/TerminalPermissionModal';
import { HistoryModal } from './modals/HistoryModal';
import { TasksModal } from './modals/TasksModal';
import { ConfirmDialogModal } from './modals/ConfirmDialogModal';
import { sorajaDb } from '../services/db';
import type { WorkspaceState } from '../hooks/useWorkspaceState';
import type { AgentProvider } from '../types/agent';

/** Semua modal tingkat aplikasi (Pengaturan, Wizard, Kredensial, HITL, Riwayat, Tugas, Konfirmasi). */
export function AppModals({
  ws,
  onOpenAgentTerminal,
}: {
  ws: WorkspaceState;
  /** Buka tab Terminal CLI untuk agen (dipakai modal Hubungkan Agen untuk login). */
  onOpenAgentTerminal: (agent: AgentProvider) => void;
}) {
  return (
    <>
      {/* 3. Settings Modal */}
      {ws.isSettingsOpen && ws.settings && (
        <SettingsModal
          isOpen={ws.isSettingsOpen}
          onClose={() => ws.setIsSettingsOpen(false)}
          settings={ws.settings}
          projects={ws.projects}
          credentials={ws.credentials}
          agentProviders={ws.agentProviders}
          dbHealth={ws.dbHealth}
          isLight={ws.isLight}
          isHighContrast={ws.isHighContrast}
          currentBg={ws.currentBg}
          currentFg={ws.currentFg}
          currentAccent={ws.currentAccent}
          currentModalBg={ws.currentModalBg}
          currentModalSidebar={ws.currentModalSidebar}
          onSaveField={ws.handleSaveSettingsField}
          onSaveMultipleSettings={ws.handleSaveMultipleSettings}
          onSyncLiveQuota={ws.handleSyncLiveQuota}
          onOpenConnectModal={(p) => ws.setConnectModalProvider(p)}
          installedCliAgents={ws.installedCliAgents}
          onSelectProject={(p) => {
            ws.setActiveProject(p);
            ws.setIsSettingsOpen(false);
          }}
          onTogglePinProject={(id) => ws.handleTogglePinProject(id, null as any)}
        />
      )}

      {/* 4. New Project Wizard Modal */}
      <NewProjectModal
        isLight={ws.isLight}
        isOpen={ws.isNewProjectModalOpen}
        wizardStep={ws.wizardStep}
        pickedFolderName={ws.pickedFolderName}
        pickedFolderPath={ws.pickedFolderPath}
        activeProject={ws.activeProject}
        selectedAgent={ws.selectedAgent}
        credentials={ws.credentials}
        agentProviders={ws.agentProviders}
        installedCliAgents={ws.installedCliAgents}
        onClose={() => ws.setIsNewProjectModalOpen(false)}
        onPickFolderDirectly={ws.handlePickFolderDirectly}
        onSetWizardStep={ws.setWizardStep}
        onFinishProjectCreation={ws.handleFinishProjectCreation}
      />

      {/* 5. Connect Credential Modal */}
      <ConnectCredentialModal
        isLight={ws.isLight}
        provider={ws.connectModalProvider}
        installedCliStatus={ws.connectModalProvider ? ws.installedCliAgents[ws.connectModalProvider.id] : undefined}
        onClose={() => ws.setConnectModalProvider(null)}
        onUseAgent={ws.handleUseAgent}
        onOpenTerminal={(agent) => {
          ws.setConnectModalProvider(null);
          onOpenAgentTerminal(agent);
        }}
      />

      {/* 6. Terminal HITL Permission Guardrail Modal */}
      <TerminalPermissionModal
        isLight={ws.isLight}
        modal={ws.hitlModal}
        onClose={() => ws.setHitlModal(null)}
        onSelectOption={(opt) =>
          ws.setHitlModal((prev) => (prev ? { ...prev, selectedOption: opt } : null))
        }
        onSubmit={(opt) => {
          const labels = [
            '',
            'Diizinkan 1x (Allow once)',
            'Selalu diizinkan di sesi ini',
            'Selalu diizinkan di project ini',
            'Selalu diizinkan secara global',
            'Perintah ditolak (Rejected)',
          ];
          ws.setHitlModal(null);
          ws.showDbToast(`Izin Terminal: ${labels[opt] || 'Diperbarui'}.`);
        }}
      />

      {/* 7. History Modal */}
      <HistoryModal
        isLight={ws.isLight}
        isOpen={ws.isHistoryModalOpen}
        conversations={ws.conversations}
        projects={ws.projects}
        onClose={() => ws.setIsHistoryModalOpen(false)}
        onSelectConversation={ws.handleSelectConversation}
      />

      {/* 8. Scheduled Tasks Modal */}
      <TasksModal
        isLight={ws.isLight}
        isOpen={ws.isTasksModalOpen}
        scheduledTasks={ws.scheduledTasks}
        onClose={() => ws.setIsTasksModalOpen(false)}
        onToggleTask={async (taskId) => {
          const updated = await sorajaDb.toggleScheduledTask(taskId);
          ws.setScheduledTasks(updated);
        }}
      />

      {/* 10. Confirmation Dialog Modal */}
      <ConfirmDialogModal
        isLight={ws.isLight}
        dialog={ws.confirmDialog}
        onClose={() => ws.setConfirmDialog(null)}
      />
    </>
  );
}
