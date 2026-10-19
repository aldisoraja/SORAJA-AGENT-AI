//! Proteksi zombie process (specs/sdd-speckit.md §7C): setiap proses CLI agen diikat ke Windows Job Object
//! dengan `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
//!
//! - `terminate()` mematikan seluruh pohon proses (CLI + compiler/dev server/shell yang dijalankannya).
//! - Soraja ditutup / crash → OS menutup handle job → seluruh proses di dalamnya ikut mati.
//! - `release()` (CLI selesai normal) mencabut batas tersebut dulu, sehingga proses latar yang sengaja
//!   ditinggal agen tetap hidup seperti saat CLI dijalankan dari terminal biasa.
//! - `suspend()` / `resume()` menjeda seluruh proses di job, bukan hanya proses induknya.
//!
//! Proses diikat segera setelah spawn; anak yang dibuat sebelum itu (jendela mikrodetik) tidak ikut job.

#[cfg(windows)]
pub use imp::{set_process_suspended, ProcessJob};

#[cfg(windows)]
mod imp {
    use std::os::windows::io::RawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::JobObjects::{
        AssignProcessToJobObject, CreateJobObjectW, JobObjectBasicProcessIdList, JobObjectExtendedLimitInformation,
        QueryInformationJobObject, SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
        JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
    };
    use windows_sys::Win32::System::Threading::{OpenProcess, PROCESS_SUSPEND_RESUME};

    #[link(name = "ntdll", kind = "raw-dylib")]
    extern "system" {
        fn NtSuspendProcess(process: HANDLE) -> i32;
        fn NtResumeProcess(process: HANDLE) -> i32;
    }

    /// Batas jumlah PID yang dibaca dari job (CLI + anak-anaknya).
    const MAX_PIDS: usize = 1024;

    pub struct ProcessJob {
        handle: HANDLE,
    }

    // HANDLE job boleh dipakai lintas thread (API kernel32 thread-safe).
    unsafe impl Send for ProcessJob {}
    unsafe impl Sync for ProcessJob {}

    impl ProcessJob {
        /// Membuat job baru dan memasukkan proses `process` (handle milik pemanggil, tidak ditutup di sini).
        pub fn attach(process: RawHandle) -> std::io::Result<Self> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return Err(std::io::Error::last_os_error());
                }
                let job = Self { handle };
                job.set_limit_flags(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE)?;
                if AssignProcessToJobObject(handle, process as HANDLE) == 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(job)
            }
        }

        fn set_limit_flags(&self, flags: u32) -> std::io::Result<()> {
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
            info.BasicLimitInformation.LimitFlags = flags;
            let ok = unsafe {
                SetInformationJobObject(
                    self.handle,
                    JobObjectExtendedLimitInformation,
                    &info as *const _ as *const _,
                    std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
                )
            };
            if ok == 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        }

        /// Mematikan seluruh proses di job (hard stop).
        pub fn terminate(&self) -> std::io::Result<()> {
            if unsafe { TerminateJobObject(self.handle, 1) } == 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        }

        /// Melepas job tanpa mematikan proses yang masih hidup (CLI selesai normal).
        pub fn release(self) {
            let _ = self.set_limit_flags(0);
        }

        /// PID seluruh proses yang sedang ada di job.
        pub(super) fn pids(&self) -> Vec<u32> {
            // JOBOBJECT_BASIC_PROCESS_ID_LIST: 2 × u32 lalu array usize.
            let mut buf = vec![0usize; 1 + MAX_PIDS];
            let ok = unsafe {
                QueryInformationJobObject(
                    self.handle,
                    JobObjectBasicProcessIdList,
                    buf.as_mut_ptr() as *mut _,
                    (buf.len() * std::mem::size_of::<usize>()) as u32,
                    std::ptr::null_mut(),
                )
            };
            if ok == 0 {
                return Vec::new();
            }
            let listed = unsafe { *(buf.as_ptr() as *const u32).add(1) } as usize;
            buf[1..=listed.min(MAX_PIDS)].iter().map(|&p| p as u32).collect()
        }

        /// Menjeda (`true`) / melanjutkan (`false`) seluruh proses di job. Mengembalikan jumlah proses yang berhasil.
        pub fn set_suspended(&self, suspend: bool) -> usize {
            self.pids().into_iter().filter(|&pid| set_process_suspended(pid, suspend)).count()
        }
    }

    impl Drop for ProcessJob {
        fn drop(&mut self) {
            // Dengan KILL_ON_JOB_CLOSE aktif, menutup handle terakhir mematikan seluruh proses di job.
            unsafe { CloseHandle(self.handle) };
        }
    }

    /// NtSuspendProcess / NtResumeProcess untuk satu PID.
    pub fn set_process_suspended(pid: u32, suspend: bool) -> bool {
        unsafe {
            let process = OpenProcess(PROCESS_SUSPEND_RESUME, 0, pid);
            if process.is_null() {
                return false;
            }
            let status = if suspend { NtSuspendProcess(process) } else { NtResumeProcess(process) };
            CloseHandle(process);
            status >= 0
        }
    }
}

#[cfg(test)]
#[cfg(windows)]
mod tests {
    use super::ProcessJob;
    use std::os::windows::io::AsRawHandle;
    use std::os::windows::process::CommandExt;

    fn spawn_sleeper() -> std::process::Child {
        // `ping -n 30` ≈ 30 detik; tanpa jendela konsol.
        std::process::Command::new("ping")
            .args(["-n", "30", "127.0.0.1"])
            .stdout(std::process::Stdio::null())
            .creation_flags(0x0800_0000)
            .spawn()
            .expect("spawn ping")
    }

    #[test]
    fn terminate_mematikan_proses_di_job() {
        let mut child = spawn_sleeper();
        let job = ProcessJob::attach(child.as_raw_handle()).expect("attach job");
        assert_eq!(job.pids(), vec![child.id()]);
        assert_eq!(job.set_suspended(true), 1);
        assert_eq!(job.set_suspended(false), 1);
        job.terminate().expect("terminate");
        assert_eq!(child.wait().expect("wait").code(), Some(1));
    }

    #[test]
    fn terminate_ikut_mematikan_cucu_proses() {
        // cmd.exe → ping.exe: ping adalah anak dari proses yang diikat ke job.
        let mut child = std::process::Command::new("cmd")
            .args(["/c", "ping -n 30 127.0.0.1 >nul"])
            .creation_flags(0x0800_0000)
            .spawn()
            .expect("spawn cmd");
        let job = ProcessJob::attach(child.as_raw_handle()).expect("attach job");
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
        while job.pids().len() < 2 && std::time::Instant::now() < deadline {
            std::thread::sleep(std::time::Duration::from_millis(50));
        }
        assert!(job.pids().len() >= 2, "ping harus ikut masuk job");
        job.terminate().expect("terminate");
        child.wait().expect("wait");
        std::thread::sleep(std::time::Duration::from_millis(200));
        assert!(job.pids().is_empty(), "tidak boleh ada proses tersisa");
    }

    #[test]
    fn release_tidak_mematikan_proses() {
        let mut child = spawn_sleeper();
        let job = ProcessJob::attach(child.as_raw_handle()).expect("attach job");
        job.release();
        std::thread::sleep(std::time::Duration::from_millis(200));
        assert!(child.try_wait().expect("try_wait").is_none(), "proses harus tetap hidup");
        let _ = child.kill();
        let _ = child.wait();
    }

    #[test]
    fn drop_tanpa_release_mematikan_proses() {
        let mut child = spawn_sleeper();
        drop(ProcessJob::attach(child.as_raw_handle()).expect("attach job"));
        assert!(child.wait().expect("wait").code().is_some());
    }
}
