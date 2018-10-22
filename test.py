from serial import Serial, time

data = '''\
1 Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus eget diam nec mauris ultricies sollicitudin. Duis semper mollis quam, a tempus massa auctor at. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Suspendisse ornare nec velit vitae semper. Maecenas accumsan nunc id vehicula aliquet. Donec cursus semper nisl, non gravida dui finibus id. Aenean auctor egestas pulvinar. Cras vitae lectus vitae dolor egestas congue. Aliquam rhoncus elit in volutpat lobortis. Quisque porta massa quis dignissim lacinia. Maecenas fermentum pharetra augue a porttitor. Cras quis blandit magna.

2 Praesent eget bibendum purus. Donec tempor aliquet turpis, sed feugiat purus tempor et. Etiam in tempus ipsum. Nullam ac elementum quam. Maecenas ut interdum diam. Etiam sagittis leo vel ex finibus, eu mattis neque tempus. Mauris sodales mattis mi vitae tincidunt. Donec justo lorem, consectetur eget pellentesque nec, vulputate at ipsum. Ut cursus, massa sed consectetur fermentum, lectus arcu sollicitudin justo, id porta tellus sem in orci. Etiam urna diam, suscipit eu pretium at, ullamcorper vel risus. Etiam gravida suscipit quam, at facilisis dui imperdiet a. Aenean augue mauris, efficitur sit amet ante nec, elementum interdum mi.

3 In faucibus consectetur enim nec eleifend. Phasellus laoreet lacus et ex malesuada iaculis. Sed tempor rhoncus faucibus. Ut vel massa urna. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Aenean sit amet metus eget augue imperdiet pretium a auctor mi. Nunc quis nunc facilisis, egestas dui ac, finibus nisl. Fusce ornare ante condimentum nisi tincidunt fringilla. Maecenas placerat vitae lectus eget fermentum. Morbi sagittis erat at felis lobortis volutpat. Phasellus vitae varius elit. Phasellus sed quam eu diam molestie fringilla. Cras auctor sem a euismod porttitor. Duis hendrerit odio sit amet aliquet porta. Phasellus quis efficitur neque, ac placerat urna.

4 Pellentesque lorem lectus, venenatis ut fringilla et, feugiat id metus. Duis vitae massa fringilla, feugiat urna non, condimentum odio. Vivamus tincidunt ipsum vel tempor semper. Etiam luctus blandit massa. Integer commodo id lectus sit amet iaculis. Praesent risus justo, vulputate in arcu at, mollis viverra turpis. Quisque blandit mi ut orci volutpat varius. Vestibulum eu ultricies mi, quis eleifend turpis. Aliquam vestibulum eros eu ante vehicula convallis eget quis odio.

5 Donec bibendum porta augue, eget sollicitudin mi. Fusce eget nibh vel augue pellentesque aliquet. Sed nec sapien posuere quam ultrices fermentum sed ut ipsum. Nam tempor scelerisque hendrerit. Aliquam eget nulla at dolor laoreet tempus ut id felis. Nullam ultrices tincidunt tincidunt. Donec sem risus, pharetra quis mi at, mollis tincidunt augue. Donec quis hendrerit tellus, vel venenatis augue. Maecenas ultricies orci eu eros feugiat, ac cursus eros lacinia. Nam bibendum, velit eu condimentum sagittis, sem lacus ultrices lacus, ut ornare tortor tellus in ante. Pellentesque ac luctus ipsum.

6 Donec porttitor neque eu felis placerat, vel posuere nisl accumsan. Mauris tempus viverra odio, sit amet gravida magna bibendum in. In aliquet pharetra dui, vel semper lacus euismod eget. Aliquam gravida, enim ac sagittis lobortis, orci ex finibus sem, et accumsan nibh ipsum ut velit. Aenean quis efficitur lacus. Nullam sodales sem ipsum. Nam auctor dictum diam sed pellentesque. Nulla cursus gravida dapibus. Ut vulputate quis neque id aliquet. Sed at nisl a quam faucibus rhoncus. Vivamus molestie vel tellus in maximus. Vivamus in massa nulla. Vivamus commodo leo ac molestie dignissim.

7 Sed pulvinar semper sapien, ut mollis diam faucibus id. Curabitur sed vehicula nulla. Nulla quis massa sit amet urna mattis volutpat eu vel lectus. Mauris id felis ut urna pulvinar mollis eu non est. Integer in elit sapien. Maecenas quis lacinia erat, in dapibus risus. Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Cras id lacus quis lacus luctus interdum eu malesuada arcu. Duis mauris quam, pulvinar et urna in, elementum condimentum augue. Curabitur vulputate mauris vitae velit fringilla, eu euismod nulla ullamcorper. Maecenas gravida leo ut enim pulvinar scelerisque.

8 Nulla gravida leo et eros venenatis vulputate. Etiam pulvinar dictum ligula a varius. Praesent semper mollis ipsum nec pretium. Curabitur mollis lacinia pharetra. Donec malesuada aliquam tellus, eget egestas nulla. Nulla at pharetra nisl. Integer hendrerit laoreet lectus, in condimentum magna commodo ac. Etiam quis suscipit velit. Aliquam in leo rutrum, bibendum est at, mattis nibh.

9 Proin ultrices eros vitae massa ultrices sollicitudin. Suspendisse porttitor eu nulla sed vestibulum. Donec luctus, mauris sed tincidunt cursus, neque lorem volutpat libero, eget ullamcorper velit risus in nulla. Suspendisse mattis nulla et aliquet faucibus. Maecenas eu accumsan lacus, vitae tristique lacus. Suspendisse eu consequat ante. Sed sollicitudin sapien nunc, eu elementum mauris auctor a. Donec vel nisi a dolor blandit eleifend vel nec augue. Etiam eget elit lacus.

10 Sed lorem tortor, laoreet id blandit at, rutrum nec est. Nulla tempus non sem eu egestas. Nulla ac volutpat neque. Vivamus eu turpis et dui fringilla porta. Sed viverra ultricies orci, facilisis interdum eros rutrum id. Nulla finibus metus vitae neque maximus elementum. Suspendisse pulvinar nunc ut mauris posuere, non aliquet velit eleifend. Vestibulum quam elit, tincidunt vitae metus ut, maximus vulputate lacus.

11 Nunc massa elit, imperdiet et leo nec, laoreet pretium eros. Vivamus quis turpis leo. Aliquam efficitur sapien sollicitudin elit venenatis, sed dignissim sapien gravida. Ut non massa eget diam sollicitudin efficitur. Suspendisse vehicula facilisis est, ut mollis magna aliquet in. Nunc eros risus, suscipit quis leo nec, condimentum finibus elit. Nullam quis tellus id elit finibus dapibus a a nisi. Morbi posuere ut orci ac tristique. Vestibulum massa quam, porttitor in lorem efficitur, hendrerit luctus leo. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Vivamus at magna eros. Vestibulum sit amet bibendum nulla, ac venenatis nunc. Sed sapien est, scelerisque eget arcu et, tincidunt tempor est.

12 Cras tempor fringilla quam, ultricies pharetra ipsum facilisis a. Interdum et malesuada fames ac ante ipsum primis in faucibus. Fusce pellentesque sapien sapien, id varius velit lobortis id. Nunc aliquam eros at turpis tincidunt pharetra. Integer in hendrerit neque. Pellentesque at mattis nisi, sit amet rhoncus nisl. Praesent finibus turpis eu gravida porta. In fringilla blandit sapien at tempus.

13 Nam consequat eleifend accumsan. Nam tristique tortor quam, non convallis purus aliquam et. Aenean non magna ut enim efficitur porttitor. In hac habitasse platea dictumst. Fusce urna sem, feugiat at elit vel, mattis lobortis velit. Sed facilisis a tortor et dictum. Morbi in tellus sit amet sem ullamcorper aliquam.

14 Proin pretium mauris ex, eu tempor orci dictum eget. Donec lobortis, urna at tempor tempus, diam ipsum hendrerit ipsum, et fringilla massa sapien pretium felis. In at accumsan dolor. Suspendisse sit amet placerat massa, sed blandit libero. Mauris semper lacus velit, eu condimentum est facilisis at. Proin auctor sem ut lectus rhoncus fermentum. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia Curae; Maecenas ac tempus lectus. Suspendisse potenti. Vestibulum nec ipsum quis sapien pharetra blandit.

15 Integer mattis libero ac euismod blandit. Fusce elementum vehicula tincidunt. Donec et sapien neque. Maecenas facilisis rhoncus sapien vel bibendum. Ut vulputate elementum ornare. Sed dignissim, ex at aliquet efficitur, lectus ex luctus odio, id vehicula ligula massa sed massa. Sed sed nulla sit amet nisl suscipit blandit at nec nisi. Nam sit amet quam ipsum. Nulla diam est, sagittis vestibulum consectetur in, suscipit eget ante. Quisque bibendum neque eu ultricies volutpat. Morbi id est elementum, aliquet augue in, facilisis tortor. Morbi tempor lorem eros, sit amet interdum dolor imperdiet et.

16 Sed efficitur eros facilisis magna sollicitudin, quis aliquam ex dictum. Morbi sit amet tincidunt arcu. Fusce et felis imperdiet, mollis orci vel, mattis nunc. Ut ligula massa, dapibus vel blandit eget, aliquam non nisi. Aenean vel diam quis massa consectetur faucibus vulputate sed mauris. Integer ut odio ultrices, euismod diam nec, elementum lacus. Cras malesuada semper felis, eu laoreet nisl lacinia non. Phasellus iaculis pharetra nunc et ornare. Cras ac metus semper, ultrices mi at, luctus tellus. Proin non porttitor lacus, et condimentum diam. Morbi vitae massa a diam luctus molestie. Curabitur gravida ultricies risus, at lacinia nisl ullamcorper vitae.

17 Nam faucibus libero est, quis suscipit lectus ultricies sed. Vestibulum finibus sit amet felis cursus varius. In sit amet libero sodales, dictum est sit amet, dapibus tortor. Morbi risus enim, pulvinar vitae sagittis id, faucibus vel mauris. Integer quis diam vel massa lobortis feugiat. Pellentesque pulvinar ipsum a lectus imperdiet rutrum. Nunc vestibulum eu justo a condimentum. Proin vel ante in elit pharetra posuere vel at mi. Integer mauris orci, mollis eu risus vel, eleifend mollis arcu. Fusce aliquet maximus ultrices. Integer et egestas nunc, eu accumsan turpis. Maecenas vestibulum euismod velit. Mauris sit amet nunc quis augue interdum faucibus. Fusce ornare, orci vel molestie ornare, purus magna luctus turpis, eu elementum libero ipsum in metus.

18 In venenatis gravida tempor. Proin hendrerit sem et augue porttitor feugiat. Suspendisse potenti. Vivamus eu mauris semper nulla ultrices vehicula vel vel ante. Integer mattis lobortis augue at mollis. Curabitur nec suscipit magna. Cras in ullamcorper ligula, nec maximus ante.

19 Nam in efficitur nisi, porttitor lacinia purus. Morbi sed dolor vitae purus posuere semper. Vivamus eleifend non quam nec venenatis. Nulla at mi ultrices, porta tortor id, commodo orci. Sed consequat fermentum tellus a facilisis. Maecenas lacinia metus eu augue tempus porta. Pellentesque lobortis neque eu sodales lobortis.

20 Curabitur pharetra convallis leo, id maximus magna dapibus eu. Ut porttitor ut nulla ut euismod. Proin pretium, metus vel vehicula aliquam, metus ex pellentesque sapien, tincidunt consectetur metus ex id justo. Maecenas ac erat quis ipsum accumsan congue. Quisque eu urna felis. Duis ac imperdiet neque, sit amet varius nunc. Nunc suscipit, metus quis condimentum fermentum, felis ligula porttitor mi, eget posuere tortor eros a mauris. Proin efficitur et est eget pellentesque. Sed luctus velit diam, nec hendrerit ipsum mollis ac. Proin elit velit, facilisis eget nisi vitae, rhoncus imperdiet purus. Phasellus congue varius facilisis. Nam ornare porta velit ac rhoncus. Donec ac quam lectus. Nam venenatis ornare velit nec dignissim. Ut sed malesuada nunc, vel semper quam. Curabitur efficitur, tellus id hendrerit porta, neque nisi vulputate nulla, eu vestibulum est metus id sem.
'''

conn = Serial('COM2')
conn2 = Serial('COM4')
data = data.replace('\n', '\r\n').encode()
amt = 0
print(len(data))
while amt < len(data):
    amt += conn.write(data[amt:amt+64])
    conn.flush()
    print(amt)
    conn2.write("Static line!\r\n".encode())
    conn2.flush()
    time.sleep(.1)
conn.flush()
time.sleep(3)
