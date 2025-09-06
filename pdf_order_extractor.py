import tkinter as tk
from tkinter import ttk, filedialog, messagebox, scrolledtext
import pdfplumber
import pandas as pd
import os
import re
from PIL import Image, ImageTk
import io
import fitz  # PyMuPDF for image extraction
import threading
from datetime import datetime
import json
import time
import traceback
import ttkbootstrap as ttkb
from ttkbootstrap.constants import *

class PDFOrderExtractor:
    def __init__(self, root):
        self.root = root
        self.root.title("PDF訂單資料提取器")
        self.root.geometry("2000x1000")  # 從1800x1000增加到2000x1000，為更寬的欄位提供空間
        
        # 數據存儲
        self.extracted_data = []
        self.images_data = []
        self.current_order_number = None  # 當前選中的訂單編號
        
        # 文件列表存儲
        self.selected_files = []  # 存儲選中的文件路徑和狀態
        
        self.setup_ui()
        
    def setup_ui(self):
        """設置用戶界面"""
        import tkinter.font as tkfont
        style = ttk.Style()
        style.configure("Treeview", font=("Arial", 15))  # 整個表格字體變大
        style.configure("Treeview.Heading", font=("Arial", 15, "bold"))
        # 主框架
        main_frame = ttkb.Frame(self.root, padding="10")
        main_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
        # 配置網格權重
        self.root.columnconfigure(0, weight=1)
        self.root.rowconfigure(0, weight=1)
        main_frame.columnconfigure(1, weight=1)
        main_frame.rowconfigure(3, weight=1)  # 調整為第3行，讓結果區域更大
        
        # 標題
        title_label = ttk.Label(main_frame, text="PDF訂單資料提取器", 
                               font=("Arial", 16, "bold"))
        title_label.grid(row=0, column=0, columnspan=3, pady=(0, 10))
        
        # 文件選擇區域
        file_frame = ttk.LabelFrame(main_frame, text="文件選擇", padding="10")
        file_frame.grid(row=1, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 5))
        file_frame.columnconfigure(1, weight=1)
        
        ttk.Label(file_frame, text="選擇PDF文件:").grid(row=0, column=0, sticky=tk.W)
        self.file_path_var = tk.StringVar()
        file_entry = ttk.Entry(file_frame, textvariable=self.file_path_var, width=50)
        file_entry.grid(row=0, column=1, padx=(10, 10), sticky=(tk.W, tk.E))
        
        ttk.Button(file_frame, text="瀏覽", command=self.browse_files).grid(row=0, column=2)
        ttk.Button(file_frame, text="選擇資料夾", command=self.browse_folder).grid(row=0, column=3, padx=(5, 0))
        
        # 控制按鈕 - 移到文件選擇區域下方
        control_frame = ttk.Frame(main_frame)
        control_frame.grid(row=2, column=0, columnspan=3, pady=(5, 10))
        
        self.extract_btn = ttk.Button(control_frame, text="開始提取", command=self.start_extraction)
        self.extract_btn.grid(row=0, column=0, padx=(0, 10))
        
        self.save_btn = ttk.Button(control_frame, text="保存為Excel", command=self.save_to_excel, state="disabled")
        self.save_btn.grid(row=0, column=1, padx=(0, 10))
        
        self.clear_btn = ttk.Button(control_frame, text="清除數據", command=self.clear_data)
        self.clear_btn.grid(row=0, column=2, padx=(0, 10))
        
        # 進度條
        self.progress_var = tk.DoubleVar()
        self.progress_bar = ttk.Progressbar(main_frame, variable=self.progress_var, maximum=100)
        self.progress_bar.grid(row=3, column=0, columnspan=3, sticky=(tk.W, tk.E), pady=(0, 5))
        
        # 狀態標籤
        self.status_var = tk.StringVar(value="準備就緒")
        status_label = ttk.Label(main_frame, textvariable=self.status_var)
        status_label.grid(row=4, column=0, columnspan=3, pady=(0, 10))
        
        # 創建左右分欄佈局 - 數據和圖像並排顯示
        content_frame = ttk.Frame(main_frame)
        content_frame.grid(row=5, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(0, 10))
        content_frame.columnconfigure(0, weight=1)  # 文件列表區域
        content_frame.columnconfigure(1, weight=11)  # 數據區域佔5份（更寬）
        content_frame.columnconfigure(2, weight=1)  # 圖像區域佔1份（更窄）
        content_frame.rowconfigure(0, weight=1)
        
        # 文件列表區域（左側）
        file_list_frame = ttk.LabelFrame(content_frame, text="文件列表", padding="5")
        file_list_frame.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S), padx=(0, 5))
        file_list_frame.columnconfigure(0, weight=1)
        file_list_frame.rowconfigure(0, weight=1)
        
        # 創建文件列表Treeview
        self.file_list_tree = ttk.Treeview(file_list_frame, columns=("文件名", "狀態", "操作"), show="headings", height=8)
        self.file_list_tree.heading("文件名", text="文件名")
        self.file_list_tree.heading("狀態", text="狀態")
        self.file_list_tree.heading("操作", text="操作")
        self.file_list_tree.column("文件名", width=200, minwidth=150)
        self.file_list_tree.column("狀態", width=60, minwidth=50)
        self.file_list_tree.column("操作", width=60, minwidth=50)
        
        # 添加滾動條
        file_scrollbar_y = ttk.Scrollbar(file_list_frame, orient=tk.VERTICAL, command=self.file_list_tree.yview)
        file_scrollbar_x = ttk.Scrollbar(file_list_frame, orient=tk.HORIZONTAL, command=self.file_list_tree.xview)
        self.file_list_tree.configure(yscrollcommand=file_scrollbar_y.set, xscrollcommand=file_scrollbar_x.set)
        
        # 佈局
        self.file_list_tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        file_scrollbar_y.grid(row=0, column=1, sticky=(tk.N, tk.S))
        file_scrollbar_x.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        # 綁定點擊事件
        self.file_list_tree.bind("<ButtonRelease-1>", self.on_file_list_selection_change)
        
        # 數據顯示區域（中間）
        data_label_frame = ttk.LabelFrame(content_frame, text="提取的數據")
        data_label_frame.grid(row=0, column=1, sticky=(tk.W, tk.E, tk.N, tk.S), padx=(5, 5))
        data_label_frame.columnconfigure(0, weight=1)
        data_label_frame.rowconfigure(0, weight=1)
        
        # 創建Treeview來顯示數據 - 增加高度
        columns = ("訂單編號", "型號", "商品名稱", "價格", "總共數量", "數量")  # 修改列順序
        self.tree = ttkb.Treeview(data_label_frame, columns=columns, show="headings", height=50, bootstyle="secondary")  # 增加高度到50
        
        # 設置列標題和寬度 - 增寬文本框大小
        column_widths = {
            "訂單編號": 0,  # 隱藏訂單編號列
            "型號": 250,
            "商品名稱": 1600,  # 大幅增加商品名稱列寬度
            "價格": 150,
            "總共數量": 150,
            "數量": 0  # 隱藏數量列
        }
        
        for col in columns:
            self.tree.heading(col, text=col)
            if col == "訂單編號" or col == "數量":
                self.tree.column(col, width=0, minwidth=0, stretch=False)
            else:
                self.tree.column(col, width=column_widths.get(col, 200), minwidth=100)
        
        # 添加滾動條
        scrollbar_y = ttkb.Scrollbar(data_label_frame, orient=tk.VERTICAL, command=self.tree.yview)
        scrollbar_x = ttkb.Scrollbar(data_label_frame, orient=tk.HORIZONTAL, command=self.tree.xview)
        self.tree.configure(yscrollcommand=scrollbar_y.set, xscrollcommand=scrollbar_x.set)
        
        # 佈局
        self.tree.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        scrollbar_y.grid(row=0, column=1, sticky=(tk.N, tk.S))
        scrollbar_x.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        # 綁定鼠標事件以顯示工具提示
        self.tree.bind("<Motion>", self.show_tooltip)
        self.tree.bind("<Leave>", self.hide_tooltip)
        
        # 綁定點擊事件以高亮對應圖像
        self.tree.bind("<ButtonRelease-1>", self.on_tree_selection_change)
        
        # 綁定鍵盤上下移動鍵事件 - 使用KeyRelease確保選擇已更新
        self.tree.bind("<KeyRelease-Up>", self.on_tree_selection_change)
        self.tree.bind("<KeyRelease-Down>", self.on_tree_selection_change)
        
        # 創建工具提示
        self.tooltip = None
        
        # 存儲高亮狀態
        self.highlighted_image_id = None
        self.highlight_rectangles = []
        
        # 防抖機制 - 避免重複觸發
        self.last_highlight_time = 0
        self.last_highlight_model = ""
        
        # 圖像顯示區域（右側）
        image_label_frame = ttk.LabelFrame(content_frame, text="提取的圖像")
        image_label_frame.grid(row=0, column=2, sticky=(tk.W, tk.E, tk.N, tk.S), padx=(5, 0))
        image_label_frame.columnconfigure(0, weight=1)
        image_label_frame.rowconfigure(0, weight=1)
        
        # 圖像顯示區域
        self.image_canvas = tk.Canvas(image_label_frame, bg="white")
        image_scrollbar_y = ttk.Scrollbar(image_label_frame, orient=tk.VERTICAL, command=self.image_canvas.yview)
        image_scrollbar_x = ttk.Scrollbar(image_label_frame, orient=tk.HORIZONTAL, command=self.image_canvas.xview)
        self.image_canvas.configure(yscrollcommand=image_scrollbar_y.set, xscrollcommand=image_scrollbar_x.set)
        
        self.image_canvas.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        image_scrollbar_y.grid(row=0, column=1, sticky=(tk.N, tk.S))
        image_scrollbar_x.grid(row=1, column=0, sticky=(tk.W, tk.E))
        
        # 日誌區域（底部）
        log_label_frame = ttk.LabelFrame(main_frame, text="處理日誌")
        log_label_frame.grid(row=6, column=0, columnspan=3, sticky=(tk.W, tk.E, tk.N, tk.S), pady=(5, 10))
        log_label_frame.columnconfigure(0, weight=1)
        log_label_frame.rowconfigure(0, weight=1)
        
        self.log_text = scrolledtext.ScrolledText(log_label_frame, height=5, width=150)  # 增大高度和寬度
        self.log_text.grid(row=0, column=0, sticky=(tk.W, tk.E, tk.N, tk.S))
        
    def log_message(self, message):
        """添加日誌消息"""
        timestamp = datetime.now().strftime("%H:%M:%S")
        log_entry = f"[{timestamp}] {message}\n"
        self.log_text.insert(tk.END, log_entry)
        self.log_text.see(tk.END)
        self.root.update_idletasks()
        
    def browse_files(self):
        """瀏覽並選擇PDF文件"""
        file_paths = filedialog.askopenfilenames(
            title="選擇PDF文件",
            filetypes=[("PDF files", "*.pdf"), ("All files", "*.*")]
        )
        if file_paths:
            for file_path in file_paths:
                self.add_file_to_list(file_path)
    
    def add_file_to_list(self, file_path):
        """添加文件到列表"""
        # 檢查文件是否已經存在
        for file_info in self.selected_files:
            if file_info['path'] == file_path:
                messagebox.showwarning("警告", f"文件 {os.path.basename(file_path)} 已經在列表中")
                return
        
        # 添加新文件
        file_info = {
            'path': file_path,
            'name': os.path.basename(file_path),
            'selected': True  # 默認勾選
        }
        self.selected_files.append(file_info)
        
        # 更新文件列表顯示
        self.update_file_list_display()
    
    def update_file_list_display(self):
        """更新文件列表顯示"""
        # 清空現有項目
        for item in self.file_list_tree.get_children():
            self.file_list_tree.delete(item)
        
        # 添加文件項目
        for i, file_info in enumerate(self.selected_files):
            status = "✓" if file_info['selected'] else "☐"
            self.file_list_tree.insert("", tk.END, values=(
                file_info['name'],
                status,
                "刪除"
            ), tags=(f"file_{i}",))
    
    def on_file_list_selection_change(self, event):
        """當文件列表選擇改變時"""
        selection = self.file_list_tree.selection()
        if not selection:
            return
        
        selected_item = selection[0]
        values = self.file_list_tree.item(selected_item, "values")
        if not values:
            return
        
        # 檢查是否點擊了"刪除"按鈕
        column = self.file_list_tree.identify_column(event.x)
        if column == "#3":  # 操作列
            self.delete_file(selected_item)
        elif column == "#2":  # 狀態列
            self.toggle_file_selection(selected_item)
    
    def delete_file(self, item_id):
        """刪除文件"""
        try:
            # 獲取文件索引
            tags = self.file_list_tree.item(item_id, "tags")
            if tags:
                file_index = int(tags[0].split("_")[1])
                if 0 <= file_index < len(self.selected_files):
                    deleted_file = self.selected_files.pop(file_index)
                    self.log_message(f"刪除文件: {deleted_file['name']}")
                    self.update_file_list_display()
        except Exception as e:
            self.log_message(f"刪除文件時出錯: {str(e)}")
    
    def toggle_file_selection(self, item_id):
        """切換文件選擇狀態"""
        try:
            # 獲取文件索引
            tags = self.file_list_tree.item(item_id, "tags")
            if tags:
                file_index = int(tags[0].split("_")[1])
                if 0 <= file_index < len(self.selected_files):
                    self.selected_files[file_index]['selected'] = not self.selected_files[file_index]['selected']
                    self.update_file_list_display()
        except Exception as e:
            self.log_message(f"切換文件選擇時出錯: {str(e)}")
    
    def get_selected_files(self):
        """獲取選中的文件列表"""
        return [file_info['path'] for file_info in self.selected_files if file_info['selected']]
    
    def browse_folder(self):
        """瀏覽並選擇包含PDF文件的資料夾"""
        folder_path = filedialog.askdirectory(title="選擇包含PDF文件的資料夾")
        if folder_path:
            pdf_files = []
            for file in os.listdir(folder_path):
                if file.lower().endswith('.pdf'):
                    pdf_files.append(os.path.join(folder_path, file))
            if pdf_files:
                self.file_path_var.set("; ".join(pdf_files))
            else:
                messagebox.showwarning("警告", "選定的資料夾中沒有找到PDF文件")
                
    def start_extraction(self):
        """開始提取過程"""
        selected_files = self.get_selected_files()
        if not selected_files:
            messagebox.showerror("錯誤", "請先選擇PDF文件")
            return
            
        # 在新線程中執行提取
        self.extract_btn.config(state="disabled")
        self.progress_var.set(0)
        self.status_var.set("正在提取...")
        
        thread = threading.Thread(target=self.extract_data, args=(selected_files,))
        thread.daemon = True
        thread.start()
        
    def extract_data(self, file_paths):
        """提取PDF數據"""
        try:
            self.extracted_data = []
            self.images_data = []
            self.tree.delete(*self.tree.get_children())
            
            total_files = len(file_paths)
            global_image_counter = 0
            
            for i, file_path in enumerate(file_paths):
                self.log_message(f"正在處理文件: {os.path.basename(file_path)}")
                self.status_var.set(f"正在處理 {i+1}/{total_files}: {os.path.basename(file_path)}")
                if not os.path.exists(file_path):
                    self.log_message(f"文件不存在: {file_path}")
                    continue
                try:
                    # 提取訂單數據
                    order_data = self.extract_order_data(file_path)
                    self.extracted_data.extend(order_data)
                    # 提取圖像
                    images, new_counter = self.extract_images(file_path, global_image_counter)
                    self.images_data.extend(images)
                    global_image_counter = new_counter
                    self.progress_var.set(((i + 1) / total_files) * 100)
                except Exception as e:
                    self.log_message(f"處理文件 {file_path} 時出錯: {str(e)}")
                    self.log_message(traceback.format_exc())
            
            self.update_data_display()
            self.update_image_display()
            self.status_var.set(f"提取完成！共處理 {len(self.extracted_data)} 條商品記錄，{len(self.images_data)} 張圖像")
            self.save_btn.config(state="normal")
            self.extract_btn.config(state="normal")
        except Exception as e:
            self.log_message(f"提取過程出錯: {str(e)}")
            self.log_message(traceback.format_exc())
            self.status_var.set("提取失敗")
            self.extract_btn.config(state="normal")
    
    def extract_order_data(self, pdf_path):
        """從PDF提取訂單數據"""
        order_data = []
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    self.log_message(f"正在處理第 {page_num + 1} 頁")
                    order_number = self.extract_order_number(page)
                    tables = page.extract_tables()
                    for table in tables:
                        if table and len(table) > 1:
                            if self.is_product_table(table):
                                products = self.parse_product_table(table, order_number, page_num + 1, pdf_path)
                                order_data.extend(products)
        except Exception as e:
            self.log_message(f"提取訂單數據時出錯: {str(e)}")
            self.log_message(traceback.format_exc())
        return order_data
    
    def extract_order_number(self, page):
        """提取單頁訂單編號，兼容 pdfplumber 和 fitz"""
        try:
            # 根據 page 來源自動選擇方法
            if hasattr(page, 'extract_text'):
                text = page.extract_text()
            elif hasattr(page, 'get_text'):
                text = page.get_text()
            else:
                text = ""
            # 尋找訂單編號模式
            patterns = [
                r'訂單編號[：:]\s*([A-Za-z0-9\-_]+)',
                r'Order\s*No[.:]\s*([A-Za-z0-9\-_]+)',
                r'單號[：:]\s*([A-Za-z0-9\-_]+)',
                r'編號[：:]\s*([A-Za-z0-9\-_]+)'
            ]
            for pattern in patterns:
                match = re.search(pattern, text)
                if match:
                    return match.group(1).strip()
            # 如果沒找到，使用頁碼作為訂單編號
            return f"未知訂單_頁{getattr(page, 'page_number', '?')}"
        except Exception as e:
            self.log_message(f"提取訂單編號時出錯: {str(e)}")
            return f"未知訂單_頁{getattr(page, 'page_number', '?')}"
    
    def is_product_table(self, table):
        """判斷是否為商品詳情表格"""
        if not table or len(table) < 2:
            return False
            
        # 檢查表頭是否包含商品相關關鍵詞
        header_text = " ".join([str(cell) for cell in table[0] if cell])
        keywords = ["商品", "產品", "名稱", "型號", "數量", "單價", "總價", "規格"]
        
        keyword_count = sum(1 for keyword in keywords if keyword in header_text)
        return keyword_count >= 2
    
    def parse_product_table(self, table, order_number, page_num, file_path):
        """解析商品表格"""
        products = []
        try:
            for row_idx, row in enumerate(table[1:], 1):
                if not row or all(cell is None or str(cell).strip() == "" for cell in row):
                    continue
                cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                product = self.parse_product_row(cleaned_row, order_number, page_num, file_path)
                if product:
                    products.append(product)
        except Exception as e:
            self.log_message(f"解析商品表格時出錯: {str(e)}")
        return products
    
    def parse_product_row(self, row, order_number, page_num, file_path):
        """解析單行商品數據"""
        try:
            if len(row) < 3:
                return None
            product_name = row[0] if len(row) > 0 else ""
            # 只保留三行中的第二行（如果有三行）
            lines = [line.strip() for line in product_name.splitlines() if line.strip()]
            if len(lines) == 3:
                product_name = lines[1]
            model = row[1] if len(row) > 1 else ""
            quantity_str = row[2] if len(row) > 2 else "1"
            unit_price_str = row[3] if len(row) > 3 else "0"
            total_price_str = row[4] if len(row) > 4 else "0"
            quantity = self.parse_quantity(quantity_str)
            if quantity <= 0:
                return None
            unit_price = self.parse_price(unit_price_str)
            total_price = self.parse_price(total_price_str)
            if total_price == 0 and unit_price > 0:
                total_price = unit_price * quantity
            return {
                "訂單編號": order_number,
                "商品名稱": product_name,
                "型號": model,
                "數量": quantity,
                "單價": unit_price,
                "總價": total_price,
                "頁碼": page_num,
                "文件路徑": file_path
            }
        except Exception as e:
            self.log_message(f"解析商品行時出錯: {str(e)}")
            return None
    
    def parse_quantity(self, quantity_str):
        """解析數量"""
        try:
            # 移除非數字字符，保留數字和小數點
            cleaned = re.sub(r'[^\d.]', '', str(quantity_str))
            if cleaned:
                return float(cleaned)
            return 1
        except:
            return 1
    
    def parse_price(self, price_str):
        """解析價格"""
        try:
            # 移除貨幣符號和逗號
            cleaned = re.sub(r'[^\d.]', '', str(price_str))
            if cleaned:
                return float(cleaned)
            return 0
        except:
            return 0
    
    def get_image_hash(self, pil_image):
        """獲取圖像的哈希值來識別重複"""
        try:
            # 將圖像轉換為小尺寸以加快比較速度
            small_image = pil_image.resize((16, 16), Image.Resampling.LANCZOS)
            # 轉換為灰度圖
            gray_image = small_image.convert('L')
            # 獲取像素數據
            pixels = list(gray_image.getdata())
            # 計算簡單哈希
            return hash(tuple(pixels))
        except Exception as e:
            self.log_message(f"計算圖像哈希時出錯: {str(e)}")
            return hash(str(pil_image.size))
    
    def extract_images(self, pdf_path, start_counter):
        """提取PDF中的圖像"""
        images = []
        global_image_counter = start_counter
        unique_images = {}  # 用於識別重複圖像
        
        try:
            doc = fitz.open(pdf_path)
            
            for page_num in range(len(doc)):
                page = doc.load_page(page_num)
                image_list = page.get_images()
                
                page_images = []
                
                for img_index, img in enumerate(image_list):
                    try:
                        xref = img[0]
                        pix = fitz.Pixmap(doc, xref)
                        
                        if pix.width <= 50 and pix.height <= 50:
                            try:
                                img_rect = page.get_image_bbox(img)
                            except:
                                img_rect = fitz.Rect(0, 0, pix.width, pix.height)
                            
                            page_width = page.rect.width
                            if img_rect.x0 < page_width / 2:
                                img_data = pix.tobytes("png")
                                pil_image = Image.open(io.BytesIO(img_data))
                                
                                # 創建圖像的哈希值來識別重複
                                img_hash = self.get_image_hash(pil_image)
                                
                                # 檢查是否為重複圖像
                                if img_hash in unique_images:
                                    # 重複圖像，使用相同的global_id
                                    existing_global_id = unique_images[img_hash]["global_id"]
                                    global_image_counter += 1
                                    
                                    page_images.append({
                                        "file_path": pdf_path,
                                        "page_num": page_num + 1,
                                        "image_index": img_index,
                                        "global_id": existing_global_id,  # 使用已存在的ID
                                        "image": pil_image,
                                        "size": (pix.width, pix.height),
                                        "position": (img_rect.x0, img_rect.y0),
                                        "bbox": img_rect,
                                        "is_duplicate": True,
                                        "image_hash": img_hash,
                                        "訂單編號": unique_images[img_hash]["訂單編號"]  # 使用已存在的訂單編號
                                    })
                                    
                                    self.log_message(f"發現重複圖像，使用ID #{existing_global_id}: {pix.width}x{pix.height} 位置({img_rect.x0:.1f},{img_rect.y0:.1f}) (第{page_num + 1}頁)")
                                else:
                                    # 新圖像
                                    global_image_counter += 1
                                    # 提取該頁的訂單編號
                                    order_number = self.extract_order_number(page)
                                    unique_images[img_hash] = {
                                        "global_id": global_image_counter,
                                        "image": pil_image,
                                        "訂單編號": order_number
                                    }
                                    
                                    page_images.append({
                                        "file_path": pdf_path,
                                        "page_num": page_num + 1,
                                        "image_index": img_index,
                                        "global_id": global_image_counter,
                                        "image": pil_image,
                                        "size": (pix.width, pix.height),
                                        "position": (img_rect.x0, img_rect.y0),
                                        "bbox": img_rect,
                                        "is_duplicate": False,
                                        "image_hash": img_hash,
                                        "訂單編號": order_number
                                    })
                                    
                                    self.log_message(f"提取新圖像 #{global_image_counter}: {pix.width}x{pix.height} 位置({img_rect.x0:.1f},{img_rect.y0:.1f}) (第{page_num + 1}頁)")
                        
                        pix = None
                        
                    except Exception as e:
                        self.log_message(f"提取圖像時出錯: {str(e)}")
                        self.log_message(traceback.format_exc())
                
                page_images.sort(key=lambda x: x["position"][1])
                images.extend(page_images)
                        
            doc.close()
            
        except Exception as e:
            self.log_message(f"提取圖像時出錯: {str(e)}")
            self.log_message(traceback.format_exc())
            
        return images, global_image_counter
    
    def update_data_display(self):
        """更新數據顯示"""
        # 建立圖片查找表（頁碼+文件路徑 -> global_id）
        image_lookup = {}
        for img in self.images_data:
            key = (img['page_num'], img['file_path'])
            if key not in image_lookup:
                image_lookup[key] = img['global_id']
        
        # 建立圖片哈希查找表（用於識別重複圖片）
        hash_lookup = {}
        for img in self.images_data:
            img_hash = img.get('image_hash')
            if img_hash:
                if img_hash not in hash_lookup:
                    hash_lookup[img_hash] = img['global_id']
        
        # 按訂單編號分組產品
        order_groups = {}
        for item in self.extracted_data:
            order_number = item['訂單編號']
            if order_number not in order_groups:
                order_groups[order_number] = []
            order_groups[order_number].append(item)
        
        # 為每個訂單編號內的產品分配圖片ID
        for order_number, products in order_groups.items():
            self.log_message(f"處理訂單 {order_number}，包含 {len(products)} 個產品")
            
            # 獲取該訂單的所有圖片
            order_images = [img for img in self.images_data if img.get('訂單編號') == order_number]
            self.log_message(f"訂單 {order_number} 的圖片數量: {len(order_images)}")
            
            # 為每個產品分配獨立的圖片ID
            for i, product in enumerate(products):
                if len(order_images) == 0:
                    # 如果該訂單沒有圖片，設置為None
                    product['image_id'] = None
                    self.log_message(f"產品 {product['型號']} 未分配圖片ID (訂單無圖片)")
                elif i < len(order_images):
                    # 如果圖片數量足夠，按順序分配
                    product['image_id'] = order_images[i]['global_id']
                    self.log_message(f"產品 {product['型號']} 分配圖片ID: {order_images[i]['global_id']} (順序分配)")
                else:
                    # 如果圖片不夠，循環使用
                    product['image_id'] = order_images[i % len(order_images)]['global_id']
                    self.log_message(f"產品 {product['型號']} 分配圖片ID: {order_images[i % len(order_images)]['global_id']} (循環分配)")
        
        # 計算每個型號的總數量
        model_total_quantities = {}
        model_first_occurrence = {}
        for i, item in enumerate(self.extracted_data):
            model = item["型號"]
            quantity = item["數量"]
            if model not in model_total_quantities:
                model_total_quantities[model] = 0
                model_first_occurrence[model] = i
            model_total_quantities[model] += quantity

        # 構造顯示數據，並標記“總共數量”列和唯一標識 row_uid
        display_data = []
        for i, item in enumerate(self.extracted_data):
            model = item["型號"]
            if i == model_first_occurrence[model]:
                total_quantity_display = str(model_total_quantities[model])
            else:
                total_quantity_display = ""
            display_data.append({
                "item": item,
                "total_quantity_display": total_quantity_display,
                "row_uid": i
            })

        # 分組：總共數量為空的放底部
        not_empty = [d for d in display_data if d["total_quantity_display"] not in ("", "0", "0.0")]
        empty = [d for d in display_data if d["total_quantity_display"] in ("", "0", "0.0")]
        display_data = not_empty + empty

        # 修改columns，插入價格和 row_uid（row_uid 可隱藏）
        columns = ("訂單編號", "型號", "商品名稱", "價格", "總共數量", "數量", "row_uid")
        self.tree["columns"] = columns
        self.tree["displaycolumns"] = ("型號", "商品名稱", "價格", "總共數量")  # 隱藏數量列
        self.tree.delete(*self.tree.get_children())
        column_widths = {
            "訂單編號": 100,
            "型號": 250,
            "商品名稱": 750,
            "價格": 120,
            "總共數量": 150,
            "數量": 0,  # 隱藏數量列
            "row_uid": 0
        }
        for col in columns:
            self.tree.heading(col, text=col)
            if col == "商品名稱":
                self.tree.column(col, width=column_widths.get(col, 200), minwidth=30, anchor=tk.W)
            elif col == "訂單編號" or col == "數量" or col == "row_uid":
                self.tree.column(col, width=0, minwidth=0, stretch=False)
            else:
                self.tree.column(col, width=column_widths.get(col, 200), minwidth=30)

        # 設置商品名稱專用 tag（整行字體變小且加粗）
        self.tree.tag_configure('small_name', font=('Arial', 11, 'bold'))
        self.tree.tag_configure('spacer', background='#F5F5F5')  # 間隔行淡灰色
        self.tree.tag_configure('yellow_row', background='#FFFACD') # 淡黃色 LemonChiffon
        for idx, d in enumerate(display_data):
            item = d["item"]
            product_name = item["商品名稱"].replace('\n', ' ').replace('\r', ' ')
            product_name = ' '.join(product_name.split())
            if len(product_name) > 120:
                product_name = product_name[:117] + "..."
            price = item.get("單價", "")
            values = (
                item["訂單編號"],
                item["型號"],
                product_name,
                price,
                d["total_quantity_display"],
                item["數量"],
                d["row_uid"]
            )
            tags = ('small_name',)
            if d["total_quantity_display"] in ("", "0", "0.0"):
                tags = ('small_name', 'yellow_row')
            self.tree.insert("", "end", values=values, tags=tags)
            # 每個商品行後插入兩條間隔行
            if idx < len(display_data) - 1:
                self.tree.insert("", "end", values=("", "", "", "", "", "", ""), tags=('spacer',))
                self.tree.insert("", "end", values=("", "", "", "", "", "", ""), tags=('spacer',))
    
    def update_image_display(self):
        """更新圖像顯示"""
        self.image_canvas.delete("all")
        self.clear_image_highlights()
        
        if not self.extracted_data:
            self.image_canvas.create_text(300, 200, text="沒有找到符合條件的圖像", font=("Arial", 12))
            return
        
        # 根據當前選中的訂單編號過濾圖片
        filtered_images = []
        if self.current_order_number:
            # 只顯示當前訂單編號的圖片
            for img_data in self.images_data:
                if img_data.get('訂單編號') == self.current_order_number:
                    filtered_images.append(img_data)
        else:
            # 如果沒有選中訂單，則顯示所有圖片
            filtered_images = self.images_data
        
        # 只顯示唯一的圖片（不顯示重複的）
        unique_images = []
        seen_ids = set()
        for img_data in filtered_images:
            global_id = img_data.get("global_id", 0)
            if global_id not in seen_ids:
                unique_images.append(img_data)
                seen_ids.add(global_id)
        
        if not unique_images:
            if self.current_order_number:
                self.image_canvas.create_text(300, 200, text=f"訂單 {self.current_order_number} 沒有找到對應的圖像", font=("Arial", 12))
            else:
                self.image_canvas.create_text(300, 200, text="沒有找到符合條件的圖像", font=("Arial", 12))
            return
            
        image_width = 100
        image_height = 100
        margin = 16
        info_height = 60
        total_height = len(unique_images) * (image_height + info_height + margin) + margin
        total_width = image_width + 20
        self.image_canvas.configure(scrollregion=(0, 0, total_width, total_height))
        
        for i, img_data in enumerate(unique_images):
            y = i * (image_height + info_height + margin) + margin
            try:
                img = img_data["image"].copy()
                img.thumbnail((image_width, image_height), Image.Resampling.LANCZOS)
                photo = ImageTk.PhotoImage(img)
                self.image_canvas.create_image(margin, y, anchor=tk.NW, image=photo)
                # 不再顯示 global_id 紅色編號
                # global_id = img_data.get("global_id", 0)
                # order_text = f"#{global_id}"
                # self.image_canvas.create_text(margin + 5, y + 5, text=order_text, font=("Arial", 10, "bold"), fill="red", anchor=tk.NW)
                info_y = y + image_height + 5
                page_text = f"頁碼: {img_data['page_num']}"
                self.image_canvas.create_text(margin + 5, info_y, text=page_text, font=("Arial", 9, "bold"), anchor=tk.NW)
                size_text = f"尺寸: {img_data['size'][0]}x{img_data['size'][1]}"
                self.image_canvas.create_text(margin + 5, info_y + 15, text=size_text, font=("Arial", 8), anchor=tk.NW)
                pos_text = f"位置: ({img_data['position'][0]:.0f}, {img_data['position'][1]:.0f})"
                self.image_canvas.create_text(margin + 5, info_y + 30, text=pos_text, font=("Arial", 8), anchor=tk.NW)
                # 顯示所有對應該圖片的型號
                try:
                    models = [item['型號'] for item in self.extracted_data if item.get('image_id') == img_data.get('global_id')]
                    if models:
                        unique_models = list(set(models))
                        if len(unique_models) > 3:
                            model_text = f"型號: {', '.join(unique_models[:3])}..."
                        else:
                            model_text = f"型號: {', '.join(unique_models)}"
                        self.image_canvas.create_text(margin + 5, info_y + 45, text=model_text, font=("Arial", 8, "bold"), fill="blue", anchor=tk.NW)
                except:
                    pass
                img_data["photo"] = photo
            except Exception as e:
                self.log_message(f"顯示圖像時出錯: {str(e)}")
    
    def save_to_excel(self):
        """保存數據到Excel文件"""
        if not self.extracted_data:
            messagebox.showwarning("警告", "沒有數據可保存")
            return
            
        try:
            file_path = filedialog.asksaveasfilename(
                title="保存Excel文件",
                defaultextension=".xlsx",
                filetypes=[("Excel files", "*.xlsx"), ("All files", "*.*")]
            )
            
            if file_path:
                # 創建DataFrame
                df = pd.DataFrame(self.extracted_data)
                
                # 保存到Excel
                with pd.ExcelWriter(file_path, engine='openpyxl') as writer:
                    df.to_excel(writer, sheet_name='訂單數據', index=False)
                    
                    # 添加圖像信息
                    if self.images_data:
                        image_info = []
                        for img in self.images_data:
                            global_id = img.get("global_id", 0)
                            image_info.append({
                                "序號": global_id,
                                "文件路徑": img["file_path"],
                                "頁碼": img["page_num"],
                                "圖像索引": img["image_index"],
                                "尺寸": f"{img['size'][0]}x{img['size'][1]}",
                                "X位置": f"{img['position'][0]:.1f}",
                                "Y位置": f"{img['position'][1]:.1f}",
                                "提取順序": "從上到下"
                            })
                        
                        image_df = pd.DataFrame(image_info)
                        image_df.to_excel(writer, sheet_name='圖像信息', index=False)
                
                messagebox.showinfo("成功", f"數據已保存到: {file_path}")
                self.log_message(f"數據已保存到: {file_path}")
                
        except Exception as e:
            messagebox.showerror("錯誤", f"保存文件時出錯: {str(e)}")
            self.log_message(f"保存文件時出錯: {str(e)}")
    
    def show_tooltip(self, event):
        """顯示工具提示"""
        try:
            # 獲取鼠標位置對應的項目
            item = self.tree.identify_row(event.y)
            if item:
                # 獲取列位置
                column = self.tree.identify_column(event.x)
                if column == "#2":  # 商品名稱列
                    # 獲取項目數據
                    values = self.tree.item(item, "values")
                    if values and len(values) > 1:
                        product_name = values[1]
                        # 如果商品名稱被截斷了，顯示完整名稱
                        if product_name.endswith("..."):
                            # 找到原始數據中的完整商品名稱
                            for data_item in self.extracted_data:
                                if (data_item["訂單編號"] == values[0] and 
                                    data_item["型號"] == values[3] and
                                    data_item["數量"] == values[4]):
                                    full_name = data_item["商品名稱"]
                                    # 將完整名稱也轉換為橫向顯示
                                    full_name = full_name.replace('\n', ' ').replace('\r', ' ')
                                    full_name = ' '.join(full_name.split())
                                    self.show_tooltip_window(event, full_name)
                                    break
        except Exception as e:
            pass
    
    def show_tooltip_window(self, event, text):
        """顯示工具提示窗口"""
        if self.tooltip:
            self.tooltip.destroy()
        
        self.tooltip = tk.Toplevel(self.root)
        self.tooltip.wm_overrideredirect(True)
        self.tooltip.wm_geometry(f"+{event.x_root+10}+{event.y_root+10}")
        
        label = tk.Label(self.tooltip, text=text, justify=tk.LEFT,
                        background="#ffffe0", relief=tk.SOLID, borderwidth=1,
                        font=("Arial", 9))
        label.pack()
        
        # 3秒後自動消失
        self.root.after(3000, self.hide_tooltip)
    
    def hide_tooltip(self, event=None):
        """隱藏工具提示"""
        if self.tooltip:
            self.tooltip.destroy()
            self.tooltip = None
    
    def highlight_corresponding_image(self, event):
        """高亮對應的圖像（用 row_uid 唯一標識）"""
        try:
            if not self.extracted_data or not self.images_data:
                return
            selection = self.tree.selection()
            if not selection:
                return
            selected_item = selection[0]
            values = self.tree.item(selected_item, "values")
            if not values or len(values) < 7:
                return
            row_uid = int(values[6])
            item = self.extracted_data[row_uid]
            image_id = item.get('image_id')
            if image_id is None:
                self.log_message(f"產品沒有分配圖片ID: 型號={item['型號']}")
                return
            # 獲取當前顯示的圖片列表（與update_image_display中的邏輯一致）
            filtered_images = []
            if self.current_order_number:
                for img_data in self.images_data:
                    if img_data.get('訂單編號') == self.current_order_number:
                        filtered_images.append(img_data)
            else:
                filtered_images = self.images_data
            self.log_message(f"過濾後圖片數量: {len(filtered_images)}")
            unique_images = []
            seen_ids = set()
            for img_data in filtered_images:
                global_id = img_data.get("global_id", 0)
                if global_id not in seen_ids:
                    unique_images.append(img_data)
                    seen_ids.add(global_id)
            self.log_message(f"唯一圖片數量: {len(unique_images)}")
            self.log_message(f"唯一圖片ID列表: {[img.get('global_id') for img in unique_images]}")
            for i, img_data in enumerate(unique_images):
                if img_data.get('global_id') == image_id:
                    self.clear_image_highlights()
                    self.highlight_image(i)
                    self.log_message(f"高亮圖片 #{image_id}，在當前顯示列表中的索引: {i}")
                    break
            else:
                self.log_message(f"未找到對應的圖片，image_id: {image_id}")
        except Exception as e:
            self.log_message(f"高亮圖像時出錯: {str(e)}")
    
    def highlight_image(self, image_index):
        """高亮指定索引的圖像（基於當前顯示的圖片列表）"""
        try:
            # 獲取當前顯示的圖片列表（與update_image_display中的邏輯一致）
            filtered_images = []
            if self.current_order_number:
                for img_data in self.images_data:
                    if img_data.get('訂單編號') == self.current_order_number:
                        filtered_images.append(img_data)
            else:
                filtered_images = self.images_data
            
            # 只顯示唯一的圖片（不顯示重複的）
            unique_images = []
            seen_ids = set()
            for img_data in filtered_images:
                global_id = img_data.get("global_id", 0)
                if global_id not in seen_ids:
                    unique_images.append(img_data)
                    seen_ids.add(global_id)
            
            if image_index >= len(unique_images):
                self.log_message(f"圖片索引超出範圍: {image_index} >= {len(unique_images)}")
                return
                
            # 設置高亮狀態
            self.highlighted_image_id = image_index
            
            # 計算圖像位置
            image_width = 120
            image_height = 120
            margin = 10
            info_height = 60
            
            y = image_index * (image_height + info_height + margin) + margin
            
            # 創建高亮矩形（紅色邊框）
            rect_id = self.image_canvas.create_rectangle(
                margin - 2, y - 2, 
                margin + image_width + 2, y + image_height + 2,
                outline="red", width=3, tags="highlight"
            )
            self.highlight_rectangles.append(rect_id)
            
            # 創建背景高亮（黃色）
            bg_rect_id = self.image_canvas.create_rectangle(
                margin, y, 
                margin + image_width, y + image_height,
                fill="yellow", stipple="gray50", tags="highlight"
            )
            self.highlight_rectangles.append(bg_rect_id)
            
            # 滾動到高亮的圖像位置
            self.scroll_to_image(image_index)
            
            self.log_message(f"成功高亮圖片索引: {image_index}")
            
        except Exception as e:
            self.log_message(f"高亮圖像時出錯: {str(e)}")
    
    def scroll_to_image(self, image_index):
        """滾動到指定的圖像位置"""
        try:
            # 計算圖像的Y位置
            image_height = 120
            info_height = 60
            margin = 10
            
            y = image_index * (image_height + info_height + margin) + margin
            
            # 獲取畫布的當前視圖
            canvas_height = self.image_canvas.winfo_height()
            
            # 計算滾動位置，讓圖像居中顯示
            scroll_y = max(0, y - canvas_height // 2)
            
            # 滾動到指定位置
            bbox = self.image_canvas.bbox("all")
            if bbox:
                self.image_canvas.yview_moveto(scroll_y / bbox[3])
            
        except Exception as e:
            self.log_message(f"滾動到圖像時出錯: {str(e)}")
    
    def is_image_matching_model(self, img_data, product_model):
        """判斷圖像是否與產品型號匹配"""
        try:
            # 獲取圖像的全局ID
            image_global_id = img_data.get('global_id', 0)
            
            # 查找對應型號的產品在數據中的索引
            product_index = -1
            for i, data_item in enumerate(self.extracted_data):
                if data_item['型號'] == product_model:
                    product_index = i
                    break
            
            if product_index == -1:
                return False
            
            # 基於提取順序建立對應關係
            # 圖像的global_id與產品在數據中的索引+1對應
            if image_global_id == product_index + 1:
                return True
            
            return False
            
        except Exception as e:
            self.log_message(f"判斷圖像匹配時出錯: {str(e)}")
            return False
    
    def clear_data(self):
        """清除所有數據"""
        self.extracted_data = []
        self.images_data = []
        self.tree.delete(*self.tree.get_children())
        self.image_canvas.delete("all")
        self.log_text.delete(1.0, tk.END)
        self.progress_var.set(0)
        self.status_var.set("準備就緒")
        self.save_btn.config(state="disabled")
        self.log_message("數據已清除")
        self.hide_tooltip()  # 清除工具提示
        self.clear_image_highlights()  # 清除圖像高亮
        self.current_order_number = None # 清除當前選中的訂單編號
        
        # 清空文件列表
        self.selected_files = []
        self.update_file_list_display()

    def clear_image_highlights(self):
        """清除所有圖像高亮"""
        # 刪除之前的高亮矩形
        for rect_id in getattr(self, 'highlight_rectangles', []):
            try:
                self.image_canvas.delete(rect_id)
            except:
                pass
        if hasattr(self, 'highlight_rectangles'):
            self.highlight_rectangles.clear()
        # 重置高亮狀態
        self.highlighted_image_id = None

    def on_tree_selection_change(self, event):
        """當樹形視圖選擇改變時更新當前訂單編號並重新顯示圖片"""
        selected_item = self.tree.selection()
        if selected_item:
            selected_values = self.tree.item(selected_item[0], "values")
            if len(selected_values) > 0:
                new_order_number = selected_values[0]
                # 如果訂單編號改變，更新圖片顯示
                if new_order_number != self.current_order_number:
                    self.current_order_number = new_order_number
                    self.update_image_display()
                # 處理高亮
                self.highlight_corresponding_image(event)
        else:
            self.current_order_number = None
            self.update_image_display()

def main():
    """主函數"""
    root = ttkb.Window(themename="flatly")  # 你可以選擇不同主題
    app = PDFOrderExtractor(root)
    root.mainloop()

if __name__ == "__main__":
    main() 