package dicwork;

import java.io.*;
import java.util.ArrayList;
import java.util.Properties;

/*
 * 유사어 작업이나, 카테고리 랭킹 작업 등에서 사전 처리가 누락된 목록을 체크함 
 * 기본적으로 comp(cnlist)에 추가해야 할 목록으로 판단해서 추출.
 * 
 * ==============================================================
 * 입력파일 :
 * inputfile : Cotton 형태소 분석 결과 후, modify.sh 구동한 파일. (파일끝에서 탭제거) (utf-8)
 * basefile : 사전에 반영된 복합어 사전 파일. cnlist.ks (utf-8)
 * 
 * 
 */

public class Check_Synonym_NonWorkDic {
		
	public static int stringCheck(String checkkwd) {
		int ret = 0;
		
		if(checkkwd.length() == 0) {
			return ret;
		}
		
		for(int i=0;i<checkkwd.length();i++){
			if (Character.isDigit(checkkwd.charAt(i))) {
				
			}
			if(Character.getType(checkkwd.charAt(i)) == 5) {
				ret = 1;
				break;
			}
		}
		
		return ret;
	}
	
	public static int digitCheck(String checkkwd) {
		int ret = 0;
		
		for(int i=0;i<checkkwd.length();i++){
			if (Character.isDigit(checkkwd.charAt(i))) {
				ret =1;
				break;
			}
		}
		
		return ret;
	}
	
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

			// input : Cotton 형태소분석 결과 파일
			//String inputfile = workdir + "/syn_ssf240419_u.res.5" ;
			String inputfile = workdir + "/cusyncompchkcttn.5" ;

////////////////////setting
			
			// 사전 cnlist 정보
			String basefile = workdir + "/cnlist.v2.ks" ;
			
			// 사전 처리가 필요한 목록
			String outputfileW = workdir + "/non_comp_ncn.txt" ;
			// 사전 처리가 필요한 목록 (형태소 분석 포함)
			String outputfileWE = workdir + "/non_comp_ncn_kor.txt" ;
			
			// debug를 위한 목록 (ncn이거나 cnlist에 기등록된 경우)
			String outputfileSE = workdir + "/skip_ncn.txt" ;
			
			// ukall 추출목록
			String outputfileRE = workdir + "/ukall.txt" ;
    	
			BufferedReader in = new BufferedReader(new FileReader(inputfile));
			BufferedReader inS = new BufferedReader(new FileReader(basefile));
			BufferedWriter outW = new BufferedWriter(new FileWriter(outputfileW));
			BufferedWriter outWE = new BufferedWriter(new FileWriter(outputfileWE));
			BufferedWriter outSE = new BufferedWriter(new FileWriter(outputfileSE));
			BufferedWriter outRE = new BufferedWriter(new FileWriter(outputfileRE));
			
			ArrayList<String> cnlistData = new ArrayList<String> ();


			String s;
			String ss;
			String[] divS ;
			//String[] synonymArr ;
			String tmpSy;
			String tmpS;
			
			String tmpBase;
			String[] ArrKwd ;
			
			
			// 복합어 사전 정보
		
			while ((ss = inS.readLine()) != null) {
				if(ss == null || ss.length() == 0) {continue;}
				tmpSy = ss.trim();
				cnlistData.add(tmpSy);		
			}
			inS.close();
		
			
			// DEBUG
			
			String tmpSE;
	
			System.out.println("cnlistData size " + cnlistData.size() + "\n");
			
			while ((s = in.readLine()) != null) {
			    if (s == null || s.length() == 0) {continue;}
			    
			    // comp 제외 \t 이 없는 경우는 형태소 분석 결과가 없는 line이다.
			    if (!s.contains("	")) {continue;}
			    	
			    ArrKwd = s.split("	");
			    tmpBase = ArrKwd[0];  // base_kwd
			    tmpSE = ArrKwd[1]; // ���� kwd
			    
			    //System.out.println(tmpBase);
			    
			    if (!tmpSE.contains(" ")) {
			    	// debug
			    	outSE.write("[DEBUG1] : " + s);
			    	//outSE.write(s);
					outSE.newLine();
			    	continue;
			    }
			    
				divS = tmpSE.split(" "); 
				
				tmpSy = divS[0] ;
				tmpS = divS[1] ; // ukall check
					
			
				if (tmpSy.compareTo(tmpBase) == 0) {
					if (tmpS.compareTo("3") == 0) {
						System.out.println(s);
						outRE.write(tmpBase);
						outRE.newLine();
					} else {
						// base_kwd와 동일한 결과. 단일어로 분석
						// 제외 list
						outSE.write(tmpBase);
						outSE.newLine();
					}
				} else {
					if ( cnlistData.contains(tmpBase) == false ) {		
						// comp : 제외
						if (tmpBase.contains("comp : ")) {
							outSE.write("[DEBUG2] : " + s);
							//outSE.write(s);
							outSE.newLine();
						} else {
						
							outW.write(tmpBase);
							outW.newLine();
							// 
							outWE.write(s);
							outWE.newLine();
						}
					} else {
						// 제외 list
						outSE.write(tmpBase);
						outSE.newLine();
					}
					
				}
			
			}
			outW.close();
			outSE.close();
			in.close();
			outRE.close();
			outWE.close();
			   
			cnlistData.clear();         
			//System.out.println("cnlistData size " + cnlistData.size() + "\n");
			System.out.println("\n done");
		////////////////////////////////////////////////////////////////
		} catch (IOException e) {
			System.err.println(e); // error
			System.exit(1);
		}

	}
}