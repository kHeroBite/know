package dicwork;


import java.io.*;
//import java.util.Map;
import java.util.HashMap; 
//import java.util.ArrayList;
//import java.util.Iterator; 
//import java.util.HashSet;
//import java.util.Set;
import java.util.Properties;

/*
 * 로그 분석 전에,유사어 사전 파일에서 작업된 유사어를 찾아냄
 * 
 * synonym full DB (UTF-8) 
 * 형태소 분석 코튼 결과 파일 (UTF-8)
 * 
 */

public class DataCheckExt_SynDB_jianareslist_v2 {
		
		
	public static void main(String[] args) throws UnsupportedEncodingException {

		try {
      
			//String workdir = "D:/work_tmp/common_log";

			
			String configFilePath = "know_work_init.txt"; // 
			
		    // 설정 파일 로드
            Properties properties = new Properties();
            try (FileReader reader = new FileReader(configFilePath)) {
                properties.load(reader);
            }

            // 저장 경로 가져오기
            String workDirectory = properties.getProperty("work_directory");
            if (workDirectory == null || workDirectory.trim().isEmpty()) {
                throw new IllegalArgumentException("work_directory 설정이 필요합니다.");
            }
			       
            String workdir = workDirectory + "/common_log";

////////////////////setting		
				
			// input: 체크할 형태소 분석 결과 파일
			// 여기 파일명을 바꾸어 주세요.
			//
			String inputfile = workdir + "/thddbdata260317.5";
			
			String chktag = "_new";

////////////////////setting
			
			// synonym. full ver. 
			// syn full 파일로 체크 (단방향 버전으로 체크)
			String synonymfile = workdir + "/synonym_full_v2.txt" ;
			
			// res file
			String outputfileW = inputfile + chktag + ".txt" ;
			
    	
			BufferedReader in = new BufferedReader(new FileReader(inputfile));
			BufferedReader inS = new BufferedReader(new FileReader(synonymfile));
				
			BufferedWriter outW = new BufferedWriter(new FileWriter(outputfileW));
			
			String s;
			String[] divS ;
			String[] divSs ;
			String[] divSss ;
			String[] synonymArr ;
			 
			String orgSynHead;
			//String orgSynTail;
			String synpartinfo;
			String headkwd;
			String jianares;
			
			String synKwdLists;
			String synPartKwdList;
			String subTail;
			String subTail2;
			
			int subcnt;
			int syncnt;
			int kwdsyncnt;
			int compcnt;
			int compsyncnt;
			
			int chkcnt;
			int linecnt;
			int subpartcnt;
			
			String s1;
			String s2;
						
			String printinfo ;
			
			boolean b;
			boolean b1;
			int chkfull ;
			
			
		
			HashMap<String, String> map = new HashMap<String, String>();
				
			//ArrayList<String> synlistData = new ArrayList<String> ();
		
			System.out.println("=========================================");
			System.out.println("step 1 start" + "\n");
					
			// synonym - map
			while ((s1 = inS.readLine()) != null) {
				if(s1 == null || s1.length() == 0) {continue;}
				
				s1 = s1.trim();
				
				synpartinfo = "";
				
				subcnt = 0;
				
				divSs = s1.split("	");
				
				if (!s1.contains("	")) {
					s2 = s1;
				} else {
					s2 = divSs[0];
				}
				synonymArr = s2.split(",");
				
				orgSynHead = synonymArr[0];
				
				subcnt= synonymArr.length;
				
				for (int j =1;j<subcnt;j++) {
					if (j == 1) {
						synpartinfo = synonymArr[j]  ;
					} else {
						synpartinfo = synpartinfo + ", " + synonymArr[j]  ;
					}
					// 2개의 유사어만 저장
					if (j > 1) { break; }
				}
				map.put(orgSynHead,synpartinfo);
			}
			inS.close();			
			
		
			System.out.println("=========================================");		
			
			System.out.println("synonym 개수 : " + map.size());
			System.out.println("=========================================");
		
					
			System.out.println("step 2 start" + "\n");
			
			
			kwdsyncnt =0;
			
			syncnt = 0;
			chkcnt = 0;
			linecnt = 0;
			subpartcnt = 0;
			compcnt = 0;
			compsyncnt = 0;
			
						
			while ((s = in.readLine()) != null) {
				if(s == null || s.length() == 0) {continue;}
				
				s = s.trim();
				printinfo = "";
				chkfull = 0;
				
				//System.out.println("line check = " + s + "\n");
				
				// comp 제외 \t 이 없는 경우는 형태소 분석 결과가 없는 line
			    if (!s.contains("	")) {
			    	//printinfo = s + "\n";
			    	printinfo = s + "\t";
			    	linecnt = 1;
			    	synKwdLists = "";
			    	
			    	divS = s.split(" ");
					
			    	compcnt = divS.length;
			    	
			    	
			    	if (s.contains("comp : ")) {
			    		//System.out.println("line = " + s + "\n");
			    		
			    		int k =2;
			    		while (k<compcnt) {
			    			headkwd = divS[k];
			    			k = k+6;
			    		  			
			    			b = map.containsKey(headkwd) ;	
			    			if (b == true) {
			    			// 해당하는 키워드가 유사어로 존재하는 경우.
			    				synKwdLists = map.get(headkwd) ;
			    				compsyncnt = compsyncnt +1;
				    		
			    				printinfo = printinfo + "\t<" + synKwdLists + ">\t" ;
				  
			    			}
			    		}
			    	}
			    	
			    	printinfo = printinfo + "\n" ;
			    	
			    } else {
			    	// 형태소 분석 결과 라인
			    	divS = s.split("	");
				
			    	headkwd = divS[0];
			    	headkwd = headkwd.trim();
				
			    	kwdsyncnt = divS.length;
								
			    	synKwdLists = "";
			    	jianares = "";
					subTail = "";
					synPartKwdList = "";
					subTail2 ="";
					
					
				if (headkwd.contains("comp : ")) {
						
						printinfo = s + "\t";
						
						linecnt = 1;
												
						for (int i =0;i<kwdsyncnt;i++) {
				    		
				    		divSss = divS[i].split(" ");
				    		subTail = divSss[2] ;
				    		
				    		//System.out.println("check kwd = " + subTail + "\n");
				    		
			    			b = map.containsKey(subTail) ;	
			    			if (b == true) {
			    				// 해당하는 키워드가 유사어로 존재하는 경우.
			    				synKwdLists = map.get(subTail) ;
			    				compsyncnt = compsyncnt +1;
				    		
			    				printinfo = printinfo + "\t<" + synKwdLists + ">\t" ;
				  
			    			}
						}	
						printinfo = printinfo + "\n" ;
						
				} else {
					
			    	// jianares
			    	for (int i =1;i<kwdsyncnt;i++) {
			    		
			    		divSss = divS[i].split(" ");
			    		subTail = divSss[0] ;
			    		
			    		if (subTail.equals(headkwd)) {
			    			chkfull = 1;
			    		}
			    		
			    		if (chkfull == 0 ) {
			    			// 부분 유사어
			    			b1 = map.containsKey(subTail) ;	
			    			if (b1 == true) {
			    				// 해당하는 키워드가 유사어로 존재하는 경우.  
			    				synPartKwdList = map.get(subTail) ;
			    				subpartcnt = subpartcnt +1;
				    		
			    				//jianares = jianares + "\t" + divS[i] + "\t<" + synPartKwdList + ">\t" ;
			    				jianares = jianares + "\t" + divS[i] ; 
			    				//subTail2 = subTail2 + subTail + " <" + synPartKwdList + ">\t" ;
			    				subTail2 = subTail2 + subTail + " <" + synPartKwdList + ">\n" ;
			
			    			} else {
			    				jianares = jianares + "\t" + divS[i]  ;
			    			}
			    					    			
			    		} else {
			    			// 한단어로 이루어진 경우, 전체 유사어로 체크
			    			jianares = jianares + "\t" + divS[i]  ;
			    		}
			    	} // for
			    	
			    	//printinfo = headkwd + "\t" + jianares  ;
			    	
			    	if (subTail2.length() == 0 ) {
			    		//printinfo = headkwd + jianares ;
			    		printinfo = headkwd + jianares + "\n" ;
			    	} else {
			    		printinfo = headkwd + jianares + "\n" + subTail2 ;
			    	}
			    	
			    	b = map.containsKey(headkwd) ;	
			    	if (b == true) {
			    		// 해당하는 키워드가 유사어로 존재하는 경우.
			    		synKwdLists = map.get(headkwd) ;
			    		syncnt = syncnt +1;
			    		
			    		//printinfo = printinfo + "\n<<" + synKwdLists + ">>\n" ;
			    		printinfo = printinfo + "<<" + synKwdLists + ">>\n" ;
			    		
			    	} else {
			    		//printinfo = printinfo + "\n" ;
			    		
			    	}
			    	
				}
			    	
			    } 
			    
			    chkcnt = chkcnt +1;
			    
			    if (linecnt == 1) {
			    	outW.write(printinfo);
			    	//outW.newLine();
			    	linecnt = 0;
			    } else {
			    	outW.newLine();
			    	outW.write(printinfo);
			    }
			}
			in.close();
			
			map.clear();
			
			
			System.out.println("=========================================");
			System.out.println("step done" + "\n");
			System.out.println("=========================================");
			System.out.println("check kwd count = " + chkcnt + "\n");
			System.out.println("syn_kwd count = " + syncnt + "\n");
			System.out.println("syn_part_kwd count = " + subpartcnt + "\n");
			System.out.println("comp_kwd count = " + compsyncnt + "\n");
			
			//System.out.println("clear - map.size() : " + map.size());
			System.out.println("=========================================");
					
			
			outW.close();
	          		
			//System.out.println("=========================================");
			
		////////////////////////////////////////////////////////////////
		} catch (IOException e) {
			System.err.println(e); // error
			System.exit(1);
		}

	}
}