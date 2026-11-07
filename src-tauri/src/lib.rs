use chrono::{DateTime, Datelike, Local, Timelike};
use serde::{Deserialize, Serialize};
use std::os::windows::ffi::OsStrExt;
use std::sync::atomic::{AtomicU64,Ordering};
use tauri::Manager;
use windows::{core::PCWSTR, Win32::{Foundation::{GetLastError, HANDLE, RECT, COLORREF}, Graphics::{Gdi::{CreateDCW, CreateFontW, CreateSolidBrush, DeleteDC, DeleteObject, DrawTextW, FillRect, GetDeviceCaps, SelectObject, SetBkMode, SetTextColor, DEVMODEW, DM_IN_BUFFER, DM_OUT_BUFFER, HORZRES, LOGPIXELSY, FW_BOLD, DEFAULT_CHARSET, OUT_DEFAULT_PRECIS, CLIP_DEFAULT_PRECIS, DEFAULT_QUALITY, DEFAULT_PITCH, DT_CENTER, DT_RIGHT, DT_RTLREADING, DT_SINGLELINE, DT_NOPREFIX, TRANSPARENT}, Printing::{ClosePrinter, DocumentPropertiesW, EnumPrintersW, OpenPrinterW, PRINTER_ENUM_LOCAL, PRINTER_ENUM_CONNECTIONS, PRINTER_INFO_2W}}, Storage::{FileSystem::{MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH}, Xps::{EndDoc, EndPage, StartDocW, StartPage, DOCINFOW}}, System::WindowsProgramming::MulDiv}};
#[derive(Serialize)] struct Printer{name:String,status:String,driver:String}
#[derive(Deserialize)] struct Sale{id:i64,product_name:String,quantity:f64,unit_price:f64,total:f64,created_at:String}
fn wide(s:&str)->Vec<u16>{s.encode_utf16().chain(std::iter::once(0)).collect()}
fn last_error(s:&str)->String{format!("{s}: Windows error {:?}",unsafe{GetLastError()})}
#[tauri::command] fn list_printers()->Result<Vec<Printer>,String>{unsafe{let flags=PRINTER_ENUM_LOCAL|PRINTER_ENUM_CONNECTIONS;let(mut needed,mut count)=(0u32,0u32);let _=EnumPrintersW(flags,PCWSTR::null(),2,None,&mut needed,&mut count);if needed==0{return Ok(vec![])}let mut b=vec![0u64;(needed as usize+7)/8];let bytes=std::slice::from_raw_parts_mut(b.as_mut_ptr() as *mut u8,needed as usize);if EnumPrintersW(flags,PCWSTR::null(),2,Some(bytes),&mut needed,&mut count).is_err(){return Err(last_error("تعذر البحث عن طابعات Windows"))}let rows=std::slice::from_raw_parts(b.as_ptr() as *const PRINTER_INFO_2W,count as usize);Ok(rows.iter().map(|p|Printer{name:p.pPrinterName.to_string().unwrap_or_default(),status:"Windows queue موجودة".into(),driver:p.pDriverName.to_string().unwrap_or_default()}).collect())}}
const DM_PAPER_SIZE_FLAG:u32=0x0000_0002;
const DM_PAPER_LENGTH_FLAG:u32=0x0000_0004;
const DM_PAPER_WIDTH_FLAG:u32=0x0000_0008;
const RECEIPT_HEIGHT_TENTHS_MM:i16=900;
fn devmode_for_receipt(queue:&str,width:u16)->Result<Vec<u64>,String>{unsafe{
 let name=wide(queue);let mut printer=HANDLE::default();OpenPrinterW(PCWSTR(name.as_ptr()),&mut printer,None).map_err(|e|format!("تعذر فتح إعدادات تعريف الطابعة: {e}"))?;
 let bytes=DocumentPropertiesW(None,printer,PCWSTR(name.as_ptr()),None,None,0);
 if bytes<=0{let _=ClosePrinter(printer);return Err("تعذر قراءة إعدادات تعريف الطابعة (DocumentProperties)".into())}
 let buffer_bytes=bytes as usize;let mut mode=vec![0u64;(buffer_bytes+7)/8];let raw=mode.as_mut_ptr() as *mut u8;let ptr=raw as *mut DEVMODEW;
 let initialized=DocumentPropertiesW(None,printer,PCWSTR(name.as_ptr()),Some(ptr),None,DM_OUT_BUFFER.0);
 if initialized<0{let _=ClosePrinter(printer);return Err("تعذر تحميل DEVMODE الافتراضي للطابعة".into())}
 let public=std::mem::size_of::<DEVMODEW>();if buffer_bytes<public||*(raw.add(68) as *const u16)<84{let _=ClosePrinter(printer);return Err("أعاد تعريف الطابعة DEVMODE غير مكتمل ولا يحتوي حقول مقاس الورق".into())}
 // DEVMODEW begins dmFields at byte 72 and paper fields at 78..84 (Windows ABI).
 let fields_ptr=raw.add(72) as *mut u32;
 let paper_size=raw.add(78) as *mut i16;
 let paper_length=raw.add(80) as *mut i16;
 let paper_width=raw.add(82) as *mut i16;
 *paper_size=0;*paper_width=(width as i16)*10;*paper_length=RECEIPT_HEIGHT_TENTHS_MM;
 *fields_ptr=(*fields_ptr & !DM_PAPER_SIZE_FLAG)|DM_PAPER_WIDTH_FLAG|DM_PAPER_LENGTH_FLAG;
 let normalized=DocumentPropertiesW(None,printer,PCWSTR(name.as_ptr()),Some(ptr),Some(ptr),DM_IN_BUFFER.0|DM_OUT_BUFFER.0);
 let _=ClosePrinter(printer);
 if normalized<0{return Err("تعريف الطابعة رفض مقاس الورق المطلوب. أضف مقاساً مخصصاً 58/80 مم من إعدادات Windows.".into())}
 let actual_width=*(raw.add(82) as *const i16);let actual_length=*(raw.add(80) as *const i16);
 let actual_fields=*(raw.add(72) as *const u32);
 if actual_width!=(width as i16)*10||actual_length!=RECEIPT_HEIGHT_TENTHS_MM||actual_fields&(DM_PAPER_WIDTH_FLAG|DM_PAPER_LENGTH_FLAG)!=(DM_PAPER_WIDTH_FLAG|DM_PAPER_LENGTH_FLAG){return Err(format!("تعريف الطابعة لم يقبل المقاس المخصص {}×90 مم (أعاد {}×{} مم). أضف المقاس من إعدادات Windows Printer Preferences.",width,actual_width as f32/10.0,actual_length as f32/10.0))}
 Ok(mode)
}}
fn color_ref(red:u8,green:u8,blue:u8)->COLORREF{COLORREF((red as u32)|((green as u32)<<8)|((blue as u32)<<16))}
unsafe fn fill_solid(dc:windows::Win32::Graphics::Gdi::HDC,rect:&RECT,color:COLORREF){let brush=CreateSolidBrush(color);let _=FillRect(dc,rect,brush);let _=DeleteObject(brush);}
unsafe fn draw_receipt_text(dc:windows::Win32::Graphics::Gdi::HDC,text:&str,rect:&mut RECT,center:bool,color:COLORREF)->bool{let mut wide_text:Vec<u16>=text.encode_utf16().collect();let _=SetTextColor(dc,color);let flags=if center{DT_CENTER}else{DT_RIGHT}|DT_RTLREADING|DT_SINGLELINE|DT_NOPREFIX;DrawTextW(dc,&mut wide_text,rect,flags)!=0}
unsafe fn draw_receipt_table(dc:windows::Win32::Graphics::Gdi::HDC,rows:&[(String,String)],left:i32,right:i32,y:&mut i32,row_height:i32,label_width:i32,border:i32,navy:COLORREF,label_color:COLORREF,black:COLORREF)->Result<(),String>{
 let split=right-label_width;
 for (label,value) in rows {
  let top=*y;let bottom=top+row_height;
  fill_solid(dc,&RECT{left:split,top,right,bottom},label_color);
  fill_solid(dc,&RECT{left,top,right:split,bottom:top+border},navy);
  fill_solid(dc,&RECT{left,top:bottom-border,right,bottom},navy);
  fill_solid(dc,&RECT{left,top,right:left+border,bottom},navy);
  fill_solid(dc,&RECT{left:split-border,top,right:split+border,bottom},navy);
  fill_solid(dc,&RECT{left:right-border,top,right,bottom},navy);
  let mut label_rect=RECT{left:split+border,top:top+border,right:right-border,bottom:bottom-border};
  let mut value_rect=RECT{left:left+border,top:top+border,right:split-border,bottom:bottom-border};
  if !draw_receipt_text(dc,label,&mut label_rect,true,black)||!draw_receipt_text(dc,value,&mut value_rect,false,black){return Err(last_error("تعذر رسم صف الإيصال العربي"))}
  *y=bottom;
 }
 Ok(())
}
fn print_gdi(queue:&str,s:&Sale,width:u16)->Result<String,String>{unsafe{
 let q=wide(queue);let driver=wide("WINSPOOL");let mut mode=devmode_for_receipt(queue,width)?;
 let dc=CreateDCW(PCWSTR(driver.as_ptr()),PCWSTR(q.as_ptr()),PCWSTR::null(),Some(mode.as_mut_ptr() as *const DEVMODEW));
 if dc.is_invalid(){return Err(last_error("تعذر فتح Windows Print Queue بالمقاس المطلوب"))}
 let title=wide(&format!("عملية {} - مخبز أولاد عثمان",s.id));
 let doc=DOCINFOW{cbSize:std::mem::size_of::<DOCINFOW>() as i32,lpszDocName:PCWSTR(title.as_ptr()),lpszOutput:PCWSTR::null(),lpszDatatype:PCWSTR::null(),fwType:0};
 if StartDocW(dc,&doc)<=0{let e=last_error("تعذر بدء مهمة الطباعة");let _=DeleteDC(dc);return Err(e)}
 if StartPage(dc)<=0{let e=last_error("تعذر بدء صفحة الطباعة");let _=EndDoc(dc);let _=DeleteDC(dc);return Err(e)}
 let dpi=GetDeviceCaps(dc,LOGPIXELSY).max(96);let face=wide("Arial");
 let body_font=CreateFontW(-MulDiv(if width<=58{8}else{10},dpi,72),0,0,0,FW_BOLD.0 as i32,0,0,0,DEFAULT_CHARSET.0 as u32,OUT_DEFAULT_PRECIS.0 as u32,CLIP_DEFAULT_PRECIS.0 as u32,DEFAULT_QUALITY.0 as u32,DEFAULT_PITCH.0 as u32,PCWSTR(face.as_ptr()));
 let banner_font=CreateFontW(-MulDiv(if width<=58{12}else{16},dpi,72),0,0,0,FW_BOLD.0 as i32,0,0,0,DEFAULT_CHARSET.0 as u32,OUT_DEFAULT_PRECIS.0 as u32,CLIP_DEFAULT_PRECIS.0 as u32,DEFAULT_QUALITY.0 as u32,DEFAULT_PITCH.0 as u32,PCWSTR(face.as_ptr()));
 let footer_font=CreateFontW(-MulDiv(if width<=58{11}else{15},dpi,72),0,0,0,FW_BOLD.0 as i32,0,0,0,DEFAULT_CHARSET.0 as u32,OUT_DEFAULT_PRECIS.0 as u32,CLIP_DEFAULT_PRECIS.0 as u32,DEFAULT_QUALITY.0 as u32,DEFAULT_PITCH.0 as u32,PCWSTR(face.as_ptr()));
 let old_font=SelectObject(dc,body_font);let _=SetBkMode(dc,TRANSPARENT);
 let navy=color_ref(16,59,106);let label_color=color_ref(201,222,246);let black=color_ref(9,13,18);let white=color_ref(255,255,255);
 let printable=GetDeviceCaps(dc,HORZRES).max(1);let margin=MulDiv(3,dpi,25);let left=margin;let right=printable-margin;let inner=(right-left).max(1);
 let banner_height=(inner*9/100).max(MulDiv(5,dpi,25));let row_height=(inner*6/100).max(MulDiv(35,dpi,254));let gap=(inner*3/100).max(MulDiv(2,dpi,25));let border=MulDiv(1,dpi,254).max(1);let label_width=inner*29/100;
 let mut y=margin;
 let header_rect=RECT{left,top:y,right,bottom:y+banner_height};fill_solid(dc,&header_rect,navy);
 let old=SelectObject(dc,banner_font);let mut header_text=RECT{left:left+border,top:y+border,right:right-border,bottom:y+banner_height-border};
 let header_ok=draw_receipt_text(dc,"مخبز أولاد عثمان",&mut header_text,true,white);let _=SelectObject(dc,old);y+=banner_height+gap;
 if !header_ok{let _=EndPage(dc);let _=EndDoc(dc);let _=SelectObject(dc,old_font);let _=DeleteObject(body_font);let _=DeleteObject(banner_font);let _=DeleteObject(footer_font);let _=DeleteDC(dc);return Err(last_error("تعذر رسم عنوان الإيصال العربي"))}
 let stamp=DateTime::parse_from_rfc3339(&s.created_at).map(|d|d.with_timezone(&Local)).unwrap_or_else(|_|Local::now());
 let day=["الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"][stamp.weekday().num_days_from_sunday() as usize];
 let month=["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"][stamp.month0() as usize];
 let date_rows=vec![("التاريخ:".into(),format!("{} {} {}",stamp.day(),month,stamp.year())),("اليوم:".into(),day.into()),("الوقت:".into(),format!("{:02}:{:02}",stamp.hour(),stamp.minute()))];
 let mut y_ref=y;let table_result=draw_receipt_table(dc,&date_rows,left,right,&mut y_ref,row_height,label_width,border,navy,label_color,black);
 y=y_ref+gap;
 if table_result.is_ok(){fill_solid(dc,&RECT{left,top:y,right,bottom:y+border*2},navy);y+=border*2+gap;}
 let sale_rows=vec![("نوع العيش:".into(),s.product_name.clone()),("الكمية:".into(),format!("{}",s.quantity)),("سعر الوحدة:".into(),format!("{:.2} ج.م",s.unit_price)),("الإجمالي:".into(),format!("{:.2} ج.م",s.total))];
 let mut y_ref=y;let sale_result=draw_receipt_table(dc,&sale_rows,left,right,&mut y_ref,row_height,label_width,border,navy,label_color,black);y=y_ref+gap;
 let result=table_result.and(sale_result);
 if result.is_ok(){let footer_height=(inner*8/100).max(MulDiv(5,dpi,25));let footer_rect=RECT{left,top:y,right,bottom:y+footer_height};fill_solid(dc,&footer_rect,navy);let old=SelectObject(dc,footer_font);let mut footer_text=RECT{left:left+border,top:y+border,right:right-border,bottom:y+footer_height-border};let ok=draw_receipt_text(dc,"شكراً لزيارتكم",&mut footer_text,true,white);let _=SelectObject(dc,old);if !ok{let _=EndPage(dc);let _=EndDoc(dc);let _=SelectObject(dc,old_font);let _=DeleteObject(body_font);let _=DeleteObject(banner_font);let _=DeleteObject(footer_font);let _=DeleteDC(dc);return Err(last_error("تعذر رسم عبارة ختام الإيصال"))}}
 let _=EndPage(dc);let job=EndDoc(dc);let _=SelectObject(dc,old_font);let _=DeleteObject(body_font);let _=DeleteObject(banner_font);let _=DeleteObject(footer_font);let _=DeleteDC(dc);
 result?;if job<=0{return Err(last_error("تعذر إرسال المهمة إلى Windows Spooler"))}Ok(format!("أرسل Windows Spooler المهمة #{job}. قبول المهمة لا يؤكد خروج الورقة."))
}}
fn app_data_dir(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{let dir=app.path().app_data_dir().map_err(|e|e.to_string())?;std::fs::create_dir_all(&dir).map_err(|e|format!("تعذر تجهيز مجلد بيانات البرنامج: {e}"))?;Ok(dir)}
fn queue_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{let current=app_data_dir(app)?.join("printer-queue.txt");if !current.exists(){if let Ok(old_dir)=app.path().app_config_dir(){let old=old_dir.join("printer-queue.txt");if old.exists(){std::fs::copy(old,&current).map_err(|e|format!("تعذر ترحيل اسم الطابعة المحفوظ: {e}"))?;}}}Ok(current)}
fn store_path(app:&tauri::AppHandle)->Result<std::path::PathBuf,String>{Ok(app_data_dir(app)?.join("pos-store.json"))}
static FILE_WRITE_ID:AtomicU64=AtomicU64::new(0);
fn atomic_write(path:&std::path::Path,bytes:&[u8])->Result<(),String>{let id=FILE_WRITE_ID.fetch_add(1,Ordering::Relaxed);let temp=path.with_extension(format!("{}.{}.tmp",path.extension().and_then(|x|x.to_str()).unwrap_or("data"),id));std::fs::write(&temp,bytes).map_err(|e|format!("تعذر كتابة ملف مؤقت: {e}"))?;let from:Vec<u16>=temp.as_os_str().encode_wide().chain(std::iter::once(0)).collect();let to:Vec<u16>=path.as_os_str().encode_wide().chain(std::iter::once(0)).collect();unsafe{MoveFileExW(PCWSTR(from.as_ptr()),PCWSTR(to.as_ptr()),MOVEFILE_REPLACE_EXISTING|MOVEFILE_WRITE_THROUGH).map_err(|e|format!("تعذر تثبيت الملف محلياً: {e}"))?;}Ok(())}
#[tauri::command] fn load_local_store(app:tauri::AppHandle)->Result<Option<serde_json::Value>,String>{let path=store_path(&app)?;if !path.exists(){return Ok(None)}let bytes=std::fs::read(&path).map_err(|e|format!("تعذر قراءة الإعدادات المحفوظة: {e}"))?;let data=serde_json::from_slice(&bytes).map_err(|e|format!("ملف بيانات البرنامج غير صالح: {e}"))?;Ok(Some(data))}
#[tauri::command] fn save_local_store(app:tauri::AppHandle,store:serde_json::Value)->Result<(),String>{let path=store_path(&app)?;let bytes=serde_json::to_vec_pretty(&store).map_err(|e|e.to_string())?;atomic_write(&path,&bytes)}
fn saved_paper_width(app:&tauri::AppHandle)->Result<u16,String>{let store=load_local_store(app.clone())?.ok_or("احفظ إعداد مقاس الورق أولاً")?;match store.pointer("/printer/paper_width").and_then(serde_json::Value::as_u64){Some(58)=>Ok(58),Some(80)=>Ok(80),_=>Err("مقاس الورق المحفوظ غير صالح. اختر 58 أو 80 مم ثم احفظ الإعدادات.".into())}}
#[tauri::command] fn save_queue(app:tauri::AppHandle,name:String)->Result<(),String>{if !list_printers()?.iter().any(|p|p.name==name){return Err("الطابعة غير موجودة في قائمة Windows".into())}let p=queue_path(&app)?;atomic_write(&p,name.as_bytes())}
fn saved_queue(app:&tauri::AppHandle)->Result<String,String>{std::fs::read_to_string(queue_path(app)?).map(|s|s.trim().to_string()).map_err(|_|"احفظ Windows Printer Queue أولاً".into())}
#[tauri::command] fn print_receipt(app:tauri::AppHandle,sale:Sale,copies:u8)->Result<Vec<String>,String>{if !(1..=3).contains(&copies){return Err("عدد النسخ غير صالح".into())}let width=saved_paper_width(&app)?;let q=saved_queue(&app)?;if !list_printers()?.iter().any(|p|p.name==q){return Err(format!("الطابعة المحفوظة غير موجودة في Windows: {q}"))}let mut jobs=vec![];for _ in 0..copies{jobs.push(print_gdi(&q,&sale,width)?)}Ok(jobs)}
#[tauri::command] fn test_print(app:tauri::AppHandle)->Result<String,String>{let width=saved_paper_width(&app)?;let q=saved_queue(&app)?;if !list_printers()?.iter().any(|p|p.name==q){return Err("تحقق من الطابعة المحفوظة".into())}print_gdi(&q,&Sale{id:0,product_name:"اختبار الطابعة".into(),quantity:1.0,unit_price:1.0,total:1.0,created_at:Local::now().to_rfc3339()},width)}
#[cfg_attr(mobile,tauri::mobile_entry_point)] pub fn run(){tauri::Builder::default().invoke_handler(tauri::generate_handler![list_printers,print_receipt,save_queue,test_print,load_local_store,save_local_store]).run(tauri::generate_context!()).expect("تعذر تشغيل مخبز أولاد عثمان")}
