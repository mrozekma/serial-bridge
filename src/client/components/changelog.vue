<template>
	<div class="changelog">
		<div v-for="{ key, seen } in entries" :class="seen ? 'seen' : 'new'">
			<template v-if="key === 'homeTable'">
				<h1>Device list</h1>
				The device list is now a table. The columns can be sorted by clicking them, and filtered by clicking the <a-icon type="filter" theme="filled" /> icon.<br>
				The current sort/filter settings can be saved and quickly reapplied later.
			</template>
			<template v-else-if="key === 'commandPalette'">
				<h1>Command palette</h1>
				A VSCode-inspired command palette is available by pressing <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>. This replaces the old device search menu.
			</template>
			<template v-else-if="key === 'nodeLinkClients'">
				<h1>Node link client</h1>
				The <i class="far fa-external-link-alt"></i>&nbsp;&nbsp;<i class="far fa-terminal"></i> buttons in the titlebar of each node that open Telnet and SSH connections now support MobaXterm. See the "Setup" tab on the homepage to tell Serial Bridge to make MobaXterm links, or to specify that you want to keep using the previous PuTTY links. The new default is to not show those links until a client has been specified.
			</template>
			<template v-else-if="key === 'contextMenu'">
				<h1>Context menu</h1>
				A context menu is now available when you right-click a node. This menu includes connection links, copy/paste options, and import/export options.
			</template>
			<template v-else-if="key === 'screenshot'">
				<h1>Screenshots</h1>
				There is an option in each device's <b>Manage</b> menu to take a screenshot of all nodes and save it to disk. A similar option appears in each node's context menu to screenshot that particular node.
			</template>
			<template v-else-if="key === 'manageMenu'">
				<h1>Manage menu</h1>
				The <b>Manage</b> menu on the device view has been renamed <b>State</b>, the <b>Ports</b> menu item under it is now <b>Manage</b>, and several other menu items were moved to the <b>View</b> menu.
			</template>
			<template v-else-if="key === 'tagFiltering'">
				<h1>Tag filtering</h1>
				You can now click <a-tag>tags</a-tag>in the devices table to quickly include/exclude them from the active filter. You can also click tags when viewing a particular device to redirect to the home view with only that tag included.
			</template>
			<template v-else-if="key === 'inactiveUsers'">
				<h1>Inactive users</h1>
				Users who have a device open in a tab but do not currently have the tab visible on-screen will be greyed out in the connections list. Mousing over the connection will show a tooltip that includes the last time the user had the device tab visible.<br><br>
				<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMoAAACGCAIAAAATnYLoAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABk0SURBVHhe7Z17dFTVvce76iXvCK14V1dr+0fvumu1a911F16rV1GCShAFQbQoARUf0Irio2bmnEkg4SEIBAEFcq+19bKsfdgiVUhmMpMHSGoLKgRUSPBByfAIJCQhj0ky75n73Y85c2ZnJg+dCYPZ3/VdrLP3nLP3nL0/89u/c+ZM+Na3rv6ptHSiLJalpeNosSwtHUeLZWnpOFosS0vH0WJZWjqOFsvS0nG0WJaOtzOu+c9/mzBpws1T/2vStAjfckfY/Wv0jjwETaFBNCt0JPjbP5mamvdShqEsQ7VGdbpqTSmwpaqVmUpltsGaZTRnqpYsxUzN9qlIN5lhfoihDA2iWaGjgSyWpeNqQBAFLGY9QDCr0dcL25GHoNkBCAMEA4ClOUu1XKmUZykVKereMereNLUqxbQnVd2Tptakq9UZqk3YH07P3z0MwsSydFyNMMPJ6G8dK8RCvbChfylkNC50p5nErX5k9HcmiVIVaSZLakFFumrOUs3ZiiVbMWcb4YoMxZauVsL6Q9KVCjQudBfTYlk6ro4ZuvRmuNCNa2EcQmuumzQNxfA+wsakaWhc6E7zUEJXpmrNNlYiVmGV/K7x3XGGXanqe6jPMmHdBHPWVGyYKvSHcBvKhO5iWixLx9UaCoP6pikzZ+Y9ft/DT8y4/5GcO++7ccpM4EVeigaWZqE7zSIQMZxZUP7j1db5f/l0ya6jD/z+owkb9/5o5Z6xBbYUU80Vpj0ppqoMU1mWEoVUobuYFsvScbVAQ3TfcsfNU+9ZnF+0vGTbCuqita88Y1o197Elt824/7qcOzlYCcDrP16s3t3Q4va5Ar6AN+B3OR3vn2xfa/l4yuY94wvMaSoWR1uGEiWACd3FtFiWjqsjaAAfIZNFkBrbiFJ3/vzhwtWbgBchbEMpMYXsucLVP1+w+PrJd7FDeCNaawPgRS73kE6RtAnhJ5NsmzMUa5pSlW20pCuWsQZrSmH57O0ftjpcQYKXzx0MgjGf39Xp9h2xNxf99aNrCsvScQhJ8CtYDEODaCpTNQvdxbRYlo6rOQqR/tnkux59yvirpWvmLXwG2wBl+v2PLFv7igYW42z5+q1F67aoKzdgZ3JgJFiD4AWYKA2EDBVk2HBVOH6pdesHLUdOt22qPD622JKhVM9741C30+MNBgMBt88fCHpd3kDA73E5Xe7m1vbXD9jHK4DSlm6yYZVEHkbwUnC9KfFKDnMONDImTbvhthlPPL+seP1W0KOsKJk1byEydI4XpQpBa+mLL+Nf7ECKlLAFi/MZiLzBULP6vvQGVeS2Arn0syKFAhbXFFt21XcE3U6fr6u9pU39w/uZz5c99MaRbqfPFQz6/T0eZ09fT5+vt8OHEOYLBPp62lsv/PpvjT8wWdIUZGNoBIHQlqnaspQKobuYFsvScTWDQGMCiMx9/OmidVvY2vd80dp5i56dMDEX6TyLXngJzC16rvBp0yq2Gwza8ovX3TN/EUn2WWuD44XQVZ1tJBeAVxTs/ddCy1rrx91ugBPsc7tONJ1/w3xsbP7v5/3usMPpR9jyuPuaWy7sOtz4wYmmHrJbwOsPens6TjWdV/+0f7xadoVpD5pCg5lKdZYic6/kcJgtujFl5lzj8vXACJHJtOqlJerKu+YsQPSa8cCjLHqBpGcLV0+9Z97k6XMeW6JgN7JzybaC1ZueyC/CFWVEg7HxwhKWqtZkKWYwkVJQM23rvk9b+7wBr9fT19necux4/cL/s40xVM79/UFHnzfoCzp7nPUnz8z5H+vETdV//PDz3gA49Pt9ns6ujtpPv5i8riJFrUb0utJoTlfQrMQrOaynAaELyRYJSBtKgdFzS9fMWbD4Zzl3XqvhtaG0cM1mxK3bZ85F5Y23373w2QJUwkXrthiWr589fxFpjTVI/9X3pTfASjHtyVTM6apl3LKqkspjbp/HF/S7enoaG7/YvPPv45e+PTa/fN6bdY4+VAe7u3uOfvHlnVtqUhTzj1fY/nLoBE3IvF6nw97ctuyt9680WjJVcsc1Vd2DxoXuYlosS8fVehqAC9J5EpBKtik0Yb956j3s4pEtjispdkuUFbfd/QA55JY7wBmoYpm+uuqlx59Wr791OjuEtSx0pzlTLaN4IRmv+OHKmgNne4Ieb0/Af7r9fM3e+glrysco1nEGK829/P5goKu3u77h6MyNFbioTFErJ285cKylO+jrdfsDHa2t7x44fk0hLh6JgVemWi50F9NiWTqu1uOVc9fPi5FOIRStfQWha/aDv0A9YwWpPSqBHaIXVkzgxe7dI+A98iQAI0sk1sdnTKtuyp3F8aJtCt1pTjVZM42V2caqKwqtN27YSzAJBlzO3s8aTy1/a993jO9kGMl15YNv1LXjYtHn6+vq/PjzEzM32dKMFWMKKq4usP76wAlcTHoC/p4OR8MXJ69bsSNNBXwknxtTUCl0F9NiWTqu1uMFhtjKWLh601PKitxZeeQrIwoKT+1Ltple2PiUcTnHi34pNCvv8WUvvoyXlq7ZjOBH1k3aGmtW6E4zvellI/cjTOb5bxz1I48K+p0dnXUNDXO22DLyyxHekEXlvXmk0+UOYHG82HWkvv6uzZXpBktagTXLYFv01qFOp8cfcPf0OP/Z2Djr5cosQ1mqqRJLZIYq8UoOM7AYCvc99EuCF/L0FzYuNhQjT9e+Xrxj9nysfQhg+UVrFz5jQpzTXkKaDxxxFCADXtPuewgvad8XCd1pzlYsqaYKOEvZ9fzbdnrX1Odu7zjw6Sc3lVSnGmuyTH/NVN6b/psDpzp6PH3dzWca39v/0S0bLFn5lnSTNUPZM+XXB1sd7kDA0d3bZ2/84tFXa8c9v+tfCqzppvKxRpnaJ4cJIhQFhJx7dXg9aVxOGAotjjfcOn3+omefK1yNy0N2A4LV499c4LVmM44iVwOFq6fd++BXwcvvdQe97raOj+qPTSypSTPWZCpvZyi144trSqq//NTe9P7H9cqfDowzmTMNViyCGcYaglePB3g5+voaT37+6P/uk3glnRlbDDJtcQQoyKKmzp6vrYDYAcQgnt0y7V5GFanUFsdQWvZMwQtk3aQvsWaF7jSHF8eC8OLocTiOnvgyr7Qm02BGeo5EKstovcpUceOG9362tmqcsSzLWI6rgTQTFkdraHF0IXx9/uWXd29CpVwck8waB3A4tV+3xVC8bs6CxQygME8ha9sktUcuRi82TateQsy7ccrM8J7DSe39gYDb7bSfb1n77gdXqe+S1F6pxD4ZSkUmwhW9hUHYUqwpNLV/laX2fn9XW+eRo8evLf5zKq5DZWqfVA7jNWkayMAFI/Ai6yO9TTqp323SsGnl7Xc/ABDJjYn1W7Hx8OJ8cp9M22FoNyZ+tGrP/jMOX8DjRaLe3rzv0y9uXA+wrOkF1jSTJUOxZhmrKGfWVBTJw16Vk1/ZX9/SFfT1On3+5rOn39pb9/2C8gyEN6ViDJqV3zkmiRkrLDghFOWx26ol24rXb0Uu/+Avf/Xft81gr4ahYYfcPPWmKTMXsduq9LLx2YIX7n7gUbYP3zn24phpLB+j1uDfNMU8dmllSeVRVyAYCHqcbm97a+dv9hz+YbEly1CVTpIwS5a6CyYxzFiTbqz695XVbx+y+8htVX+fo+PYCXv+dls21k1kcrTZDEXe90oOMwg0s9ukIIZ8V732FeT4CEi3Tp/D7t1jB8YZQETcIrfsKYtFdDF9dIly8x2z2W6a9X3prftSCPGmetrWfQ0XuskC6Qv0utwtnV2/23ds4qa/fbfAjFUyTdmXqryXqdiuWmq5dcv+t+vs5Etu8kWkp6npXPnfD05c/U6KYsswWbKV8lS1GiAK3cW0WJaOq/UowMCIfaXN1jvEsGX0S8aHn3j+7rmP4SIRnpn3+IInDfnF60jc2lCKdE1ZueFJQzGuDHjc0hbTgR7ICX+l/W3TnqsLLC9WHOv2eIJ+L5J8l8fd6XR+fLKltPbzRX/4KPfVD6e8+uEv/3jwtf0n61s6PZQtt8ff1XzmyNGjT79eeZXyzhVqJUjNJikaechH6C6mxbJ0XK1HgW1ff+v0X/xqKdgCYYhMZINxtvYVXBvC2CDw0WtMsKWu3PC0unLuY0u0FvRtCt1pziDXd+EHctJU2/eXmf/8SXvQ6w0EnAHEMWRinm6H19/u9DT39sEdLk8fCW+9ATDo8TgunP3y+Ccl5rrvGd9BApdCbknQx1YViVfSmDOhmWKBGAbCQBKoYssf4SyEmobd0hdfNq4oeUpZAbYmTMzlSFGqtA2hO80ZarnwOCFy+e8UWt482uFw9Lm8Hl/AFQBMAU/A5wmAOdiHy0S3y+939Xadb275pL5+g+Xw2OfexqJJnvRSEbdIRMyQ0St5HAZLY4L6+sl3zXnkyecKVyNnB0aIWEXrtiBW4V8sl7iuVFaU4DJz4TOmGUjn6bFaOk8calPrSHCGCXiRh0sBGXsYOpUEs6prCiqW7z5yuPF8W4/b2dvr7vM5Xd5ej5u41+Xo7GtrOf+Zvcn2wSfPbq/5nuGdTKMtXbGRJ1SV8nSF4UWejRa6i2mxLB1XaxyEHULkupw7b51x//2PPLk4vwj5PhZBIIWN/KK1uEh8bImCJGzStHvJDfp+VGkWutMMAshCpjMQAShpivVqU9ntm6pe2H246mjTqebWltYLrS3nWs6dOX32TP2Jxp37j6lv7r3lxbLxym5yY4w4oh1mobuYFsvScbVAA8yuDcl2CLIbbpuBS8Kps+cjeZ8+Z0HurLyJubNuoA/eREQsOLIpWOhOc3+8EMOwwKWYKq8oqElRq8YVVP2ouPK6Ne/e92rtwu0fPv76gVnb9k54YecPllVkG8zY4dtqzRjyZH054pbQFCx0F9NiWTqujvkzWooL40xj6NqbpxKHitpuERs6D/gz2t0CENQ2pOe4AESqnol4ZqxINdmyjOZxht1j83dlGstTTSTHwkqarljSSKYlHB6y/Bltkjj6HwFgrGi49EdH24HVC6+GPKw/ApCuVtHMyZqtmK9UyrONlmwFhFUjP0sx2WBsoEj/CABe1f4IAHao0rcDyz8CkCyO/idM9OhoNdo2K2o7CC+FjGaH+SdMyDfc5BJSqQQ09O+U7B1nqABn9Fdr4MmCYqpak2qqSSNUEfLY9+IR7RjK5J8wSSIDAoSZgSDTAIq6ra+kRlNocAC2mAEBiWFhyBhGFvZMM2DKUixj6G/UsozE2EAxS0WyRdZHHJJO/saEOd2EAzlYaHAYbMFiWVo6jhbL0tJxtFiWlo6jxbK0dBwtlqVH2j8JWaj/RlgsS4+oNba+oYSJZemRs8AWs7DPZe7g8BXoJ7/UkOXz+bxer8fjcVO5QmJF1ONV7MP37ic+4jrxWUlKDQ8vfkJU/HTpeEkNXRpbjCqn07l9+3b8y4p6wmKJj3skanyGkkzDwIufRwgsdqoYCE0YF6lBxcACT1BfX9/rr78+efJk/IttVqlBJoiPMhUbfDYRfFaSkrCh4sXPgLLFzg0nyU4bY8GGTGooYlRBvb29r732Wk5Iv/3tb1HDXmKQ9Rcbajbsesj43CQfYUPCi7/3EFsMLA0p/XhJDaoeKofDAbYmRQo1qGc78L11YoOskcc4Y5AlLWHfYiczsHDOUHd3d1dXV2dnZ0dHx8WLFw8ePGg0GnNzc/nYSI2UMOYYeYw/ZgFzgRnBvGB22DTxOUsODY4Xe9P92ZJgXVph/JOfsOHhxdhqa2vDp4efpdSlE2YBc8EIuyzxYm9XH7ra29svXLgwdepUfopSl04IYC0tLZiRpA1gw8MLH5TW1lacEq50+ClKXVI1NzdjRjAvlz1eWujCKUm8kkTnz5/HjLAAdhnjxUIXVnqErnPnzkm8kkRNTU2YEZaBYY4uP7xY6JJ4JacEvLQAxufvUmsgvOjHQEy8sDLilCReSaKzZ88mc/r1VfDCKUm8kkRnzpz5JuDF8nqJV7JJwys5s/vh4YWLFFyqSLySR8ArmS8eE4GX2c6/0GSym0eGxW113aw7XiY1DqHmG6fRhpfAFiTxSqBGGV4WRlcYKfMpiVcCNTrxCjoOl/KasCICm90yiTVRepgycMrMN4KOum05Wjuop3sRhXYgwuGiBsGrlBWYQr3rK/mBpayZU3X0pWRHc7QtjhGzGIaMz3SE7BbSiB4aLvTKtyDQRhootwsPyvH6sAbEy3yKbGmieJWL67ijDm+X48Ul8fpaSkRqH0kM5iwnh9fQ7fAObDp126GgxdAxN1KiaKBi2xwpRoAYIIeCF+uFydyoq2GfCtJ+6WGGV7KDxTQa8eIKLXCIUmx2AQQ/jr2kx4stgpHL2SHGC/Di6EQoBl66qKbrJdQykx4jvXT1ukU5mTXqci/drPNkC3gNHr2GhJcOnSji0S70BkLLdAQooUpH3d/1UVOnUO4l8YqDEpXa60SvHCOCB1dE7jUwXv1zr35YQJFpExMnUsi90F1OjngPhXEp8Yqj4o2XiJE+g9FPJ5l11sQQ8YIiEImGF8Rb4wpHuxjHRhAm8Yq7Epl7SSVeEi+pBEriJZVASbykEiiJl1QCJfGSSqAkXlIJlMRLKoGSeEklUBIvqQRK4iWVQI06vMynyJd3yYAf+f4xxleTQ1Tkd+T670+TRRKvYejro8la4IWvrXJ7II6tJUISr2EoCfGyh57XSE5JvKAov5iAwo9wYQnL0e/T/7FB/qggEdk51Lol/BSY3SK0QH8PQhdHc2QQ0r3D8OP20aAkTwT1x4usuafMaISKPM2mPQUUg2zdQ/36xZo9jU0rzbRNXq/ff7AVWeI1adK2Q3Y+7mTC+ByAjNBYl1rMbCMamlQWeyN99pCgQkii2+TRxdCv3LbV1dEf/7AWSA0UwotMpDav2w45+JyVNwY0ejCj/ZnmD5xRUV5ZLYWJHcg+IbxHgks0GsyNoV7Ih4Rvkw9GaOdttB+OF3lX2ikMmj5KvCJEkmU2jvrxDWngY5lCAJFYhakS9o2OV4ge7Bx+A5hr3cxhIsMH9hd5t5w/Fr1oLW0kfBZRGY2QlsxFvM/Y7wpl7Z1HlcSLCJVh6eaGlsPDF/VYKn0gYRMTfdxj4MXpwTp2qDtEScRVIZX2xqJJIyMCLwSeMA2x8NKv2uztsc9G+L1reIU544r+KdIk8QpPDNRv+Mi6RhYAuvTEwCtiMkIADSt60V6wzf5lNYgTA/IkCGeB7qBh4hWRwIWGgrz58Puk9bxNMXphzyifIk0SL/340iBEx7H0sD2UzbA4RLZj4BXegW7ziSHTjIWJ7T1w7kVE5sl+Sr8C6nOvqDIf0o7WLeXDxIvywivJUhrx5lm1zL2GhZdeGKkcTDMXmWA+jmTCuDDHvDn+Uw5xkuhkMNntOoB09eQQ0ki4hfCVIxOfUf07J2m+pqhk8Nf0B5J2hoEXuNZW4Yg3TyIW0wBXjgOyBY06vKS+gvT5w7Ak8ZIaTHTN7B/2hiKJl1Q06XIDvpR/JUm8pBIoiZdUAjXq8HrooYfMZvPx48c/T7DQBTpCd7zjUanRhRcmG7Pe1tbmcrnof8mbQKELdITuRjNhowsvhBNMOZ//ERG6Q6e8+9Gn0YUXYskIxC290B065d2PPo0uvJAS8WkfQaFT3v3ok8Qr4ZJ4SbwSKInXaMerYcfcnQ182+Nprd2sKzbXbkTJzUs6NezMi1ovSuI16qNXw865O0JAEZ7mbqxt5UX6UjSKJF6DS+JFBaQ2c6Baazdu3LFTK0YGNr0kXoNL4sWEBXFjbTPZatiBDa0YridhjImTR/Gq55Ubay/QnaJI4iXxIlGKLoiAiEQrGrTc4aimWz1JeGN75s2du6Oe1mF7Y+15utlPEi+JFwfIDZ4YRgAGGyGqgBSLUlykMmJxDDEXRRIviRdE4latRgmNW7WhxCsaPRKvwSXx0kTSrI1apiUUwZ6Y4pPFcWc940sujtEl8QoLESgvdMEINezIC2XxRPr1kYJGotfOHaEazlkUSbwkXgmUxGu04PXZZ5/xOR9BSbxGC14NDQ3ygZyR1OjCq7y8XD5OOJIaXXjJh6FHWN8ovFpbW5ubmwfAC8Jky59yjJiAF2YE83J549XZ2Xnx4sWh4CU1ktLwwuxgjr4JeDU1NUm8kkT4qF+ueEECXsh1Wlpazp07l5uby89P6tJpypQp+KhjRjAvAl58/i61BseLESbgZTAY+ClKXTphFjAXerySKnRBQ8ULHwvt4hHR+B//+Ac+OvwspS6FMP6YBcxF0l42QsPAiwUwLPMsgOHc8OmRkI28MOYYeYw/C11Jm3hBw8NLH8BwbsgrT58+bbfbGxsbT548+U+dTkjFQ3w0qTDCGGeMNsYcI4/x14euyxIviL1dRhhOg2VgGmFILXFtjBM+RYWTl0qE2PBinDHaGHONLZZ1JefKCA0PLxbANMIQmRlkjDN8pKQSJ0YVhDHHyOvZSs7QBQ2OF8TetEAYYjJWfQYZ44zpvFS8xUeWUgVhzDHyGP8kZwsaBl6QRpgeMnyGIJywJpy/VLzEx5SKDbUeLEjPFsTnLDk0JLwg/t5DhAmQMeG0pRInPsqRYEFJyxY0VLwgfgaUMA0yiJ0qE85cKhHi40vFx52CBfFZST62enp6/h/xf5Dro1eYPQAAAABJRU5ErkJggg==">
			</template>
			<a-alert v-else type="error" message="Bad entry" show-icon>
				<template #description>
					Configuration file specifies unknown changelog entry <b>{{ key }}</b>
				</template>
			</a-alert>
		</div>
	</div>
</template>

<script lang="ts">
	import Vue from 'vue';

	export default Vue.extend({
		props: {
			entries: Array,
		},
	});
</script>

<style lang="less" scoped>
	.changelog {
		margin-left: 10px;

		h1 {
			margin-bottom: 5px;
		}

		> div {
			padding-left: 10px;
			border-left: 5px solid;
			&.new {
				border-left-color: #fadb14;
			}
			&.seen {
				border-left-color: #595959;
				opacity: .5;
			}
			&:not(:first-child) {
				margin-top: 10px;
			}
		}

		.ant-alert {
			margin-top: 10px;
		}

		kbd {
				display: inline-block;
				margin: 0 .1em;
				padding: .1em .6em;
				font-size: 11px;
				color: #242729;
				text-shadow: 0 1px 0 #fff;
				background-color: #e1e3e5;
				border: 1px solid #adb3b9;
				border-radius: 3px;
				white-space: nowrap;
		}
	}
</style>
